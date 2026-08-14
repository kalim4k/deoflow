/**
 * Forme JSON d'une génération, telle que le frontend la consomme.
 *
 * Deux champs de la ligne ne sortent JAMAIS :
 *   - `sourceUrls` — les URLs kie.ai, temporaires ; les publier ferait
 *     afficher des images qui disparaissent, et exposerait le fournisseur ;
 *   - `providerTaskId` — utile au diagnostic, sans usage côté client.
 */
import 'server-only';
import type { GenerationRow } from '@/lib/server/generations/service';

export interface GenerationDto {
  id: string;
  kind: string;
  modelSlug: string;
  modelName: string;
  mode: string;
  prompt: string;
  ratio: string | null;
  durationSeconds: number | null;
  credits: number;
  status: string;
  /** URLs Cloudinary, permanentes. Vide tant que la tâche court. */
  urls: string[];
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

function asUrlList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((u): u is string => typeof u === 'string') : [];
}

export function serializeGeneration(row: GenerationRow): GenerationDto {
  return {
    id: row.id,
    kind: row.kind,
    modelSlug: row.modelSlug,
    modelName: row.modelName,
    mode: row.mode,
    prompt: row.prompt,
    ratio: row.ratio,
    durationSeconds: row.durationSeconds,
    credits: row.credits,
    status: row.status,
    urls: asUrlList(row.assetUrls),
    failureCode: row.failureCode,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
