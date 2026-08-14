/**
 * POST /api/generations/upload — dépose un fichier de référence et renvoie son
 * URL publique.
 *
 * kie.ai télécharge les références depuis SES serveurs : il lui faut une URL
 * `https://` joignable. Un `blob:` local ne lui dit rien. Ce passage par
 * Cloudinary est donc obligatoire dès qu'une génération part d'un fichier.
 *
 * La liste des types acceptés n'est pas écrite ici : elle est l'union de ce
 * que les emplacements du catalogue déclarent (`lib/deoflow/capabilities.ts`).
 * Ajouter un modèle qui accepte un nouveau format ouvre donc automatiquement
 * l'envoi, sans qu'on ait à y penser.
 *
 * ⚠️ Plafond de la plateforme : sur Vercel, le corps d'une requête ne peut
 * dépasser 4,5 Mo, quel que soit `GENERATION_UPLOAD_MAX_BYTES`. Les grosses
 * vidéos de référence (Kling accepte 100 Mo, Seedance 200 Mo) ne passeront
 * donc pas par cette route en hébergement serverless — il faudra un envoi
 * direct navigateur → stockage avec un jeton signé. Sur un serveur classique,
 * seule la variable ci-dessous limite.
 */
export const runtime = 'nodejs';

import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/cloudinary-client';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';
import { MODEL_CAPABILITIES } from '@/lib/deoflow/capabilities';

/** Union des types acceptés par au moins un emplacement du catalogue. */
function acceptedMimeTypes(): Set<string> {
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return NextResponse.json(
        { error: 'STORAGE_NOT_CONFIGURED', message: 'Le stockage n’est pas configuré.' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const maxBytes = Number.parseInt(
      process.env.GENERATION_UPLOAD_MAX_BYTES ?? String(200 * 1024 * 1024),
      10,
    );

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'UPLOAD_MISSING_FILE', message: 'Aucun fichier reçu.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: 'FILE_TOO_LARGE', message: `Maximum ${Math.round(maxBytes / 1048576)} Mo.` },
        { status: 413, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!acceptedMimeTypes().has(file.type)) {
      return NextResponse.json(
        { error: 'INVALID_MIME', message: `Format non accepté : ${file.type || 'inconnu'}` },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Octets lus seulement après les refus bon marché.
    const buf = Buffer.from(await file.arrayBuffer());
    const { match, sniffed } = verifyMagicBytes(buf, file.type);
    if (sniffed && !match) {
      // Un fichier dont les octets démentent le type déclaré : on refuse ici,
      // sinon kie.ai le refuserait plus tard — après débit.
      return NextResponse.json(
        {
          error: 'MAGIC_BYTE_MISMATCH',
          message: 'Le contenu ne correspond pas au format annoncé.',
        },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const publicId = `references/${auth.user.sub}/${randomUUID()}`;
    let uploaded;
    try {
      uploaded = await uploadBuffer(publicId, buf, file.type);
    } catch (err) {
      if (err instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { error: 'STORAGE_NOT_CONFIGURED', message: 'Le stockage n’est pas configuré.' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      // Sans cette ligne, un refus du stockage ne laisse aucune trace : le
      // créateur voit « L'envoi a échoué », le journal ne montre qu'un 502,
      // et la vraie cause (mauvaise clé, quota, option refusée) reste
      // invisible côté serveur.
      log.error('generation: envoi de la référence refusé par le stockage', {
        err: String(err),
        mimeType: file.type,
        sizeBytes: buf.length,
      });
      return NextResponse.json(
        { error: 'UPLOAD_FAILED', message: 'L’envoi a échoué.' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.fileUpload.create({
      data: {
        userId: auth.user.sub,
        key: uploaded.publicId,
        filename: sanitizeFilename(file.name),
        mimeType: file.type,
        sizeBytes: uploaded.bytes,
      },
    });

    return NextResponse.json(
      { url: uploaded.secureUrl, mimeType: file.type, sizeBytes: uploaded.bytes },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
