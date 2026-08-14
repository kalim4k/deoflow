/**
 * Recopie des résultats kie.ai vers Cloudinary.
 *
 * kie.ai sert ses rendus depuis son propre CDN, mais sa documentation est
 * explicite : « Generated video URLs have certain validity periods. It's
 * recommended to download and save them to your storage system promptly. »
 * Garder seulement leur URL reviendrait à promettre une galerie qui se vide
 * toute seule — le créateur aurait payé des crédits pour du contenu disparu.
 *
 * On recopie donc dès que la tâche réussit. Le fetch sortant n'est soumis à
 * aucun plafond de corps de requête (celui de Vercel ne vise que les requêtes
 * ENTRANTES et les réponses), et le tampon reste très en dessous de la
 * mémoire d'une fonction.
 */
import 'server-only';
import { log } from '@/lib/server/observability/log';
import { uploadBuffer } from '@/lib/server/upload/cloudinary-client';

/** Au-delà, on refuse de charger en mémoire plutôt que de faire tomber la fonction. */
const MAX_ASSET_BYTES = Number(process.env.GENERATION_MAX_ASSET_BYTES ?? 200 * 1024 * 1024);

export class AssetCopyError extends Error {
  readonly code = 'ASSET_COPY_FAILED';
}

async function fetchAsset(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new AssetCopyError(`Téléchargement impossible (${res.status}) : ${url}`);
  }

  // `content-length` est indicatif : on revérifie après lecture, mais le
  // contrôle en amont évite d'aspirer un fichier manifestement trop gros.
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_ASSET_BYTES) {
    throw new AssetCopyError(`Fichier trop volumineux (${declared} octets).`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_ASSET_BYTES) {
    throw new AssetCopyError(`Fichier trop volumineux (${buffer.byteLength} octets).`);
  }

  return {
    buffer,
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  };
}

/**
 * Recopie chaque URL et renvoie les URLs Cloudinary correspondantes, dans le
 * même ordre.
 *
 * Un échec sur un fichier ne perd pas les autres : on garde ce qui a été
 * recopié. Renvoyer une liste vide alors que la génération a réussi
 * signalerait à l'appelant qu'il faut rembourser.
 */
export async function copyResultsToStorage(
  urls: string[],
  keyPrefix: string,
): Promise<{ stored: string[]; failures: number }> {
  const stored: string[] = [];
  let failures = 0;

  for (const [index, url] of urls.entries()) {
    try {
      const { buffer, contentType } = await fetchAsset(url);
      const uploaded = await uploadBuffer(`${keyPrefix}/${index}`, buffer, contentType);
      stored.push(uploaded.secureUrl);
    } catch (err) {
      failures += 1;
      log.error('generation: recopie du résultat impossible', {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { stored, failures };
}
