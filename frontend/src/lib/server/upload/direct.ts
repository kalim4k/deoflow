/**
 * Envoi direct navigateur → Cloudinary, pour les fichiers trop lourds pour
 * transiter par nos fonctions.
 *
 * Sur Vercel, le corps d'une requête ENTRANTE ne peut dépasser 4,5 Mo. Une
 * vidéo de 15 s filmée au téléphone en pèse souvent 5 à 30 : par la route
 * `POST /api/generations/upload`, elle était refusée avant même d'arriver.
 *
 * Le parcours en trois temps :
 *   1. `sign`     — le serveur vérifie type et taille annoncés, choisit
 *                   l'identifiant (dans le dossier de l'utilisateur) et signe ;
 *   2. le navigateur envoie le fichier à Cloudinary avec cette signature ;
 *   3. `complete` — le serveur relit la ressource CHEZ CLOUDINARY et la
 *                   contrôle avant de l'enregistrer.
 *
 * Contrôle du contenu : la route classique compare les premiers octets au
 * type annoncé (`sniff.ts`). Ici les octets ne passent pas par nous ; c'est
 * Cloudinary qui décode le fichier, et deux verrous tiennent lieu de
 * vérification — plus forte qu'un en-tête, puisqu'un fichier qui ne se
 * décode pas est refusé :
 *   - `allowed_formats`, SIGNÉ : Cloudinary refuse tout format détecté hors
 *     liste, quel que soit le type annoncé par le navigateur ;
 *   - à `complete`, le format DÉTECTÉ et la taille réelle sont relus et
 *     comparés ; un fichier non conforme est supprimé.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getCloudinary, uploadPreset } from '@/lib/server/upload/cloudinary-client';
import { MODEL_CAPABILITIES } from '@/lib/deoflow/capabilities';

/**
 * Formats Cloudinary admis pour chaque type MIME du catalogue. Un type absent
 * d'ici n'est pas envoyable en direct — mieux vaut refuser que deviner.
 */
export const FORMATS_BY_MIME: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'video/mp4': ['mp4'],
  'video/quicktime': ['mov'],
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/x-wav': ['wav'],
  'audio/aac': ['aac'],
  'audio/mp4': ['m4a', 'mp4'],
  'audio/ogg': ['ogg'],
};

/** Union des types acceptés par au moins un emplacement du catalogue. */
export function acceptedGenerationMimes(): Set<string> {
  const types = new Set<string>();
  for (const caps of Object.values(MODEL_CAPABILITIES)) {
    for (const mode of caps.modes) {
      for (const slot of mode.slots) {
        for (const mime of slot.accept) types.add(mime);
      }
    }
  }
  return types;
}

/** Cloudinary range les sons avec les vidéos. */
export function resourceTypeOf(mimeType: string): 'image' | 'video' {
  return mimeType.startsWith('image/') ? 'image' : 'video';
}

export function generationUploadMaxBytes(): number {
  return Number.parseInt(process.env.GENERATION_UPLOAD_MAX_BYTES ?? String(200 * 1024 * 1024), 10);
}

export class DirectUploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DirectUploadError';
  }
}

/** Dossier propre à l'utilisateur : `complete` refuse tout identifiant hors de lui. */
function userPrefix(userId: string): string {
  return `references/${userId}/`;
}

export interface SignedUpload {
  uploadUrl: string;
  /** Champs à joindre tels quels au formulaire envoyé à Cloudinary, avec `file`. */
  fields: Record<string, string>;
}

export function signDirectUpload(input: {
  userId: string;
  mimeType: string;
  sizeBytes: number;
}): SignedUpload {
  const formats = FORMATS_BY_MIME[input.mimeType];
  if (!formats || !acceptedGenerationMimes().has(input.mimeType)) {
    throw new DirectUploadError(
      'INVALID_MIME',
      `Format non accepté : ${input.mimeType || 'inconnu'}`,
      415,
    );
  }
  const maxBytes = generationUploadMaxBytes();
  if (!(input.sizeBytes > 0) || input.sizeBytes > maxBytes) {
    throw new DirectUploadError(
      'FILE_TOO_LARGE',
      `Maximum ${Math.round(maxBytes / 1048576)} Mo.`,
      413,
    );
  }

  const cloudinary = getCloudinary();
  const { api_key: apiKey, api_secret: apiSecret, cloud_name: cloudName } = cloudinary.config();
  if (!apiKey || !apiSecret || !cloudName) {
    throw new DirectUploadError('STORAGE_NOT_CONFIGURED', 'Le stockage n’est pas configuré.', 503);
  }

  const preset = uploadPreset();
  const params: Record<string, string> = {
    public_id: `${userPrefix(input.userId)}${randomUUID()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
    allowed_formats: formats.join(','),
    ...(preset ? { upload_preset: preset } : {}),
  };
  const signature = cloudinary.utils.api_sign_request(params, apiSecret);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceTypeOf(input.mimeType)}/upload`,
    fields: { ...params, api_key: apiKey, signature },
  };
}

export interface CompletedUpload {
  publicId: string;
  url: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

/**
 * Relit chez Cloudinary ce que le navigateur dit avoir envoyé, et le contrôle.
 *
 * Le navigateur ne fournit qu'un identifiant et un type : la taille, le format
 * et l'adresse viennent tous de Cloudinary. Un fichier non conforme est
 * supprimé — il a déjà coûté du stockage, il n'en coûtera pas plus.
 */
export async function completeDirectUpload(input: {
  userId: string;
  publicId: string;
  mimeType: string;
}): Promise<CompletedUpload> {
  const prefix = userPrefix(input.userId);
  const rest = input.publicId.startsWith(prefix) ? input.publicId.slice(prefix.length) : '';
  if (!/^[0-9a-f-]{36}$/.test(rest)) {
    throw new DirectUploadError('UPLOAD_NOT_FOUND', 'Fichier introuvable.', 404);
  }
  const formats = FORMATS_BY_MIME[input.mimeType];
  if (!formats) {
    throw new DirectUploadError('INVALID_MIME', 'Format non accepté.', 415);
  }

  const cloudinary = getCloudinary();
  const resourceType = resourceTypeOf(input.mimeType);
  let resource: Record<string, unknown>;
  try {
    resource = (await cloudinary.api.resource(input.publicId, {
      resource_type: resourceType,
      media_metadata: resourceType === 'video',
    })) as unknown as Record<string, unknown>;
  } catch {
    throw new DirectUploadError('UPLOAD_NOT_FOUND', 'Fichier introuvable.', 404);
  }

  const reject = async (code: string, message: string, status: number): Promise<never> => {
    await cloudinary.uploader
      .destroy(input.publicId, { resource_type: resourceType, invalidate: true })
      .catch(() => undefined);
    throw new DirectUploadError(code, message, status);
  };

  const format = String(resource.format ?? '').toLowerCase();
  if (!formats.includes(format)) {
    return reject('INVALID_FILE_CONTENT', 'Le contenu ne correspond pas au format annoncé.', 415);
  }
  const bytes = Number(resource.bytes);
  const maxBytes = generationUploadMaxBytes();
  if (!(bytes > 0) || bytes > maxBytes) {
    return reject('FILE_TOO_LARGE', `Maximum ${Math.round(maxBytes / 1048576)} Mo.`, 413);
  }

  const duration = Number(resource.duration);
  return {
    publicId: input.publicId,
    url: String(resource.secure_url),
    sizeBytes: bytes,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
  };
}
