/**
 * Client kie.ai — la passerelle qui expose les six modèles du catalogue.
 *
 * Deux familles d'endpoints, et c'est la principale surprise de cette API :
 *
 *   - « jobs » — générique, cinq modèles :
 *       POST /api/v1/jobs/createTask        { model, input, callBackUrl? }
 *       GET  /api/v1/jobs/recordInfo?taskId=…   → state waiting|success|fail
 *   - « veo » — Veo 3.1 seul, endpoints et vocabulaire distincts :
 *       POST /api/v1/veo/generate          { model:'veo3', prompt, … }
 *       GET  /api/v1/veo/record-info?taskId=…   → successFlag 0|1|2|3
 *
 * D'où `family` dans le handle de tâche : sans lui, on interrogerait le mauvais
 * endpoint au moment du sondage et toute génération Veo resterait « en cours »
 * indéfiniment.
 *
 * Le tout est asynchrone : on crée une tâche, on reçoit un `taskId`, puis on
 * sonde (ou on attend le callback). Aucun appel ne rend l'image directement.
 *
 * Inerte sans `KIE_API_KEY` — même schéma que Google OAuth et Bictorys : les
 * routes appelantes répondent 503 plutôt que de planter au démarrage.
 *
 * ⚠️ Ce module est strictement serveur. La clé kie.ai est facturée à l'usage :
 * l'exposer au navigateur reviendrait à offrir un budget de génération à
 * quiconque ouvre les outils de développement.
 */
import 'server-only';
import { log } from '@/lib/server/observability/log';
import {
  MODEL_CAPABILITIES,
  alwaysRequires,
  effectiveSlots,
  minBillableSeconds,
  modeFor,
  paramsFor,
  type ModelCapabilities,
  type ModelMode,
  type ParamValues,
} from '@/lib/deoflow/capabilities';

const DEFAULT_BASE_URL = 'https://api.kie.ai';
const REQUEST_TIMEOUT_MS = Number(process.env.KIE_TIMEOUT_MS ?? 20_000);

/** Identifiants exacts attendus par kie.ai — ne jamais les deviner. */
export type KieModelId =
  | 'nano-banana-2'
  | 'gpt-image-2-image-to-image'
  | 'kling-2.6/motion-control'
  | 'gemini-omni-video'
  | 'bytedance/seedance-2-5'
  | 'veo3_lite';

export type TaskFamily = 'jobs' | 'veo';

/** Codes d'erreur stables, consommés par les routes puis par le frontend. */
export type KieErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_OUT_OF_FUNDS'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_BAD_REQUEST'
  | 'PROVIDER_UNAVAILABLE';

export class KieError extends Error {
  constructor(
    readonly code: KieErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'KieError';
  }
}

export interface KieProvider {
  apiKey: string;
  baseUrl: string;
}

export function tryCreateKieProvider(): KieProvider | undefined {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    log.warn('kie: KIE_API_KEY absente — la génération réelle est désactivée');
    return undefined;
  }
  return { apiKey, baseUrl: process.env.KIE_BASE_URL ?? DEFAULT_BASE_URL };
}

/* ── Correspondance catalogue Deoflow → modèle kie.ai ───────────────────── */

interface ModelBinding {
  id: KieModelId;
  family: TaskFamily;
  kind: 'image' | 'video';
  /** Ratios acceptés PAR L'API. Vide = le paramètre n'existe pas. */
  ratios: string[];
  /** L'API refuse la requête sans média de référence, quel que soit le mode. */
  requiresImage: boolean;
  requiresVideo: boolean;
}

/** Ce qui identifie le modèle chez kie.ai — tout le reste en est dérivé. */
const ENDPOINTS: Record<string, Pick<ModelBinding, 'id' | 'family' | 'kind'>> = {
  'nano-banana-2': { id: 'nano-banana-2', family: 'jobs', kind: 'image' },
  'gpt-image-2': { id: 'gpt-image-2-image-to-image', family: 'jobs', kind: 'image' },
  // Variante **Lite** : 30 crédits kie.ai le clip en 720p, contre 250 pour
  // `veo3` (Quality) et 60 pour `veo3_fast`. Choix du propriétaire — sur un
  // format vertical destiné à TikTok, l'écart de rendu ne justifiait pas huit
  // fois le prix.
  'veo-3-1': { id: 'veo3_lite', family: 'veo', kind: 'video' },
  'kling-2-6': { id: 'kling-2.6/motion-control', family: 'jobs', kind: 'video' },
  'seedance-2-5': { id: 'bytedance/seedance-2-5', family: 'jobs', kind: 'video' },
  'gemini-omni-flash': { id: 'gemini-omni-video', family: 'jobs', kind: 'video' },
};

/**
 * Le catalogue (`lib/deoflow/catalog.ts`) décrit ce qu'on VEND ; les capacités
 * (`lib/deoflow/capabilities.ts`) décrivent ce que le fournisseur SAIT FAIRE.
 * Cette table ne fait que joindre les deux à l'identifiant kie.ai.
 *
 * Ratios, durées et médias obligatoires sont DÉRIVÉS des capacités, jamais
 * recopiés : deux listes tenues à la main finissent par diverger, et la
 * divergence ne se verrait qu'au moment d'un appel déjà facturé.
 */
export const MODEL_BINDINGS: Record<string, ModelBinding> = Object.fromEntries(
  Object.entries(ENDPOINTS).map(([slug, endpoint]) => {
    const caps = MODEL_CAPABILITIES[slug];
    const binding: ModelBinding = {
      ...endpoint,
      ratios: caps?.apiRatios ?? [],
      requiresImage: alwaysRequires(slug, 'image'),
      requiresVideo: alwaysRequires(slug, 'video'),
    };
    return [slug, binding];
  }),
);

export function bindingFor(slug: string): ModelBinding | undefined {
  return MODEL_BINDINGS[slug];
}

/* ── Création de tâche ──────────────────────────────────────────────────── */

export interface GenerateRequest {
  /** Slug du catalogue Deoflow, pas l'identifiant kie.ai. */
  modelSlug: string;
  /** Mode d'entrée retenu (`text`, `image`, `motion`, `frames`, `references`). */
  mode?: string | null;
  prompt: string;
  aspectRatio?: string | null;
  durationSeconds?: number | null;
  /**
   * Médias indexés par CLÉ D'EMPLACEMENT de l'API — `first_frame_url`,
   * `reference_video_urls`… URLs PUBLIQUES : kie.ai va les télécharger depuis
   * ses serveurs, un blob local ne marche pas.
   */
  media?: Record<string, string[]>;
  /** Réglages déclarés par le modèle (`character_orientation`, `generate_audio`…). */
  params?: ParamValues;
  callbackUrl?: string | null;
}

export interface TaskHandle {
  taskId: string;
  family: TaskFamily;
}

/**
 * Réglages jamais exposés au créateur, imposés ici.
 *
 * La qualité est volontairement verrouillée en entrée de gamme (1K / 720p) :
 * les paliers supérieurs coûtent plusieurs fois plus cher chez le fournisseur,
 * et les vendre au même prix creuserait la marge à chaque génération. Les
 * ouvrir demandera un multiplicateur de crédits, donc une décision de prix.
 */
const LOCKED: Partial<Record<KieModelId, Record<string, unknown>>> = {
  'nano-banana-2': { resolution: '1K', output_format: 'jpg' },
  'gpt-image-2-image-to-image': { resolution: '1K' },
  'gemini-omni-video': { resolution: '720p' },
  'bytedance/seedance-2-5': {
    resolution: '720p',
    output_format: 'mp4',
    web_search: false,
    nsfw_checker: true,
    return_last_frame: false,
  },
  'kling-2.6/motion-control': { mode: '720p' },
};

/** Format retenu quand le créateur n'en a pas choisi un que l'API accepte. */
const DEFAULT_RATIO: Partial<Record<KieModelId, string>> = {
  'nano-banana-2': 'auto',
  'gpt-image-2-image-to-image': 'auto',
  'gemini-omni-video': '16:9',
  'bytedance/seedance-2-5': 'adaptive',
};

/**
 * Construit l'objet `input`.
 *
 * Rien n'est écrit en dur par modèle : les emplacements portent leur propre
 * clé d'API et leur forme (`wire`), les paramètres viennent de la déclaration.
 * Ne subsiste que l'irréductible — la durée est une CHAÎNE chez Gemini et un
 * NOMBRE chez Seedance, et Veo n'a pas d'objet `input` du tout.
 */
function buildInput(
  binding: ModelBinding,
  caps: ModelCapabilities,
  mode: ModelMode | undefined,
  req: GenerateRequest,
): Record<string, unknown> {
  const values = req.params ?? {};
  const input: Record<string, unknown> = { prompt: req.prompt };

  for (const slot of effectiveSlots(mode, values)) {
    const urls = (req.media?.[slot.key] ?? []).slice(0, slot.maxCount);
    if (urls.length === 0) continue;
    input[slot.key] = slot.wire === 'string' ? urls[0] : urls;
  }

  // Un paramètre n'est transmis que si sa valeur figure dans la déclaration :
  // une valeur inventée par l'appelant ferait échouer la tâche après débit.
  for (const param of paramsFor(caps, mode)) {
    const value = values[param.key];
    if (param.kind === 'toggle') {
      input[param.key] = typeof value === 'boolean' ? value : param.default;
    } else {
      const valid = typeof value === 'string' && param.options.some((o) => o.value === value);
      input[param.key] = valid ? value : param.default;
    }
  }

  const ratio =
    req.aspectRatio && binding.ratios.includes(req.aspectRatio) ? req.aspectRatio : null;
  const fallbackRatio = DEFAULT_RATIO[binding.id];
  if (ratio ?? fallbackRatio) input.aspect_ratio = ratio ?? fallbackRatio;

  if (caps.duration.kind === 'choice' || caps.duration.kind === 'range') {
    const seconds = req.durationSeconds ?? minBillableSeconds(req.modelSlug);
    // Gemini attend une chaîne, Seedance un nombre. Se tromper de type est
    // refusé côté fournisseur.
    input.duration = binding.id === 'gemini-omni-video' ? String(seconds) : seconds;
  }

  return { ...input, ...(LOCKED[binding.id] ?? {}) };
}

async function call(
  provider: KieProvider,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<{ code: number; msg?: string; data?: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    // Réseau coupé ou délai dépassé : rien n'a pu être facturé côté kie.ai,
    // l'appelant peut donc rembourser sans risque de double comptage.
    throw new KieError(
      'PROVIDER_UNAVAILABLE',
      err instanceof Error ? err.message : 'Appel kie.ai impossible',
    );
  }

  if (!res.ok) {
    throw new KieError(mapStatus(res.status), `kie.ai a répondu ${res.status}`, res.status);
  }

  const json = (await res.json()) as { code: number; msg?: string; data?: unknown };

  // kie.ai peut renvoyer 200 HTTP avec un code métier en erreur.
  if (json.code !== 200) {
    throw new KieError(
      mapStatus(json.code),
      json.msg ?? `kie.ai a répondu ${json.code}`,
      json.code,
    );
  }

  return json;
}

function mapStatus(status: number): KieErrorCode {
  switch (status) {
    case 401:
      return 'PROVIDER_AUTH_FAILED';
    // 402 = LE COMPTE DEOFLOW est à sec chez kie.ai, pas le solde du créateur.
    // Confondre les deux ferait accuser l'utilisateur d'un problème de caisse.
    case 402:
      return 'PROVIDER_OUT_OF_FUNDS';
    case 429:
      return 'PROVIDER_RATE_LIMITED';
    case 400:
    case 404:
    case 422:
      return 'PROVIDER_BAD_REQUEST';
    default:
      return 'PROVIDER_UNAVAILABLE';
  }
}

export async function createTask(provider: KieProvider, req: GenerateRequest): Promise<TaskHandle> {
  const binding = bindingFor(req.modelSlug);
  const caps = MODEL_CAPABILITIES[req.modelSlug];
  if (!binding || !caps) {
    throw new KieError('PROVIDER_BAD_REQUEST', `Modèle inconnu : ${req.modelSlug}`);
  }

  const mode = modeFor(req.modelSlug, req.mode);
  if (!mode) {
    throw new KieError('PROVIDER_BAD_REQUEST', `Mode inconnu : ${req.mode}`);
  }

  // Vérifier les emplacements AVANT tout appel réseau : une requête refusée
  // par kie.ai après débit du créateur oblige à rembourser, et le
  // remboursement est ce qui se perd le plus facilement.
  const slots = effectiveSlots(mode, req.params ?? {});
  for (const slot of slots) {
    const count = (req.media?.[slot.key] ?? []).length;
    if (slot.requirement === 'required' && count === 0) {
      throw new KieError('PROVIDER_BAD_REQUEST', `Fichier manquant : ${slot.label}.`);
    }
  }
  if (mode.requiresAnySlot && slots.every((s) => (req.media?.[s.key] ?? []).length === 0)) {
    throw new KieError('PROVIDER_BAD_REQUEST', 'Ce mode exige au moins un fichier de référence.');
  }

  const veoImages = slots.flatMap((slot) => (req.media?.[slot.key] ?? []).slice(0, slot.maxCount));

  const body =
    binding.family === 'veo'
      ? {
          model: binding.id,
          prompt: req.prompt,
          aspect_ratio:
            req.aspectRatio && binding.ratios.includes(req.aspectRatio) ? req.aspectRatio : '16:9',
          // Les réglages déclarés (ici la définition) se posent à plat comme le
          // reste : Veo n'a pas d'objet `input`. Une valeur hors liste est
          // remplacée par le défaut plutôt que transmise — le fournisseur la
          // refuserait après débit.
          ...Object.fromEntries(
            paramsFor(caps, mode).map((param) => {
              const value = req.params?.[param.key];
              if (param.kind === 'toggle') {
                return [param.key, typeof value === 'boolean' ? value : param.default];
              }
              const valid =
                typeof value === 'string' && param.options.some((o) => o.value === value);
              return [param.key, valid ? value : param.default];
            }),
          ),
          // Veo pose ses médias à plat, pas dans un objet `input`.
          // `slice` comme dans `buildInput` : le mode « début et fin » accepte
          // 2 images, celui des références 3. En envoyer une de plus fait
          // refuser la tâche par le fournisseur — après débit du créateur.
          ...(veoImages.length > 0 ? { imageUrls: veoImages } : {}),
          // Sans mode explicite, Veo le déduit de la présence d'images — et ne
          // peut donc pas distinguer « deux images = début et fin » de « deux
          // images = références ». Le déclarer est ce qui rend les deux modes
          // distincts au lieu d'en produire un au hasard.
          ...(mode?.apiMode ? { generationType: mode.apiMode } : {}),
          ...(req.callbackUrl ? { callBackUrl: req.callbackUrl } : {}),
        }
      : {
          model: binding.id,
          input: buildInput(binding, caps, mode, req),
          ...(req.callbackUrl ? { callBackUrl: req.callbackUrl } : {}),
        };

  const path = binding.family === 'veo' ? '/api/v1/veo/generate' : '/api/v1/jobs/createTask';
  const json = await call(provider, path, { method: 'POST', body });

  const taskId = (json.data as { taskId?: string } | undefined)?.taskId;
  if (!taskId) {
    throw new KieError('PROVIDER_UNAVAILABLE', 'kie.ai n’a pas renvoyé de taskId');
  }

  log.info('kie: tâche créée', { model: binding.id, taskId });
  return { taskId, family: binding.family };
}

/* ── Sondage ────────────────────────────────────────────────────────────── */

export type TaskState =
  | { status: 'RUNNING' }
  | { status: 'SUCCEEDED'; urls: string[]; costMs: number | null }
  | { status: 'FAILED'; code: string | null; message: string };

/** Les deux familles n'expriment pas l'état de la même façon — on normalise. */
export async function getTask(provider: KieProvider, handle: TaskHandle): Promise<TaskState> {
  const path =
    handle.family === 'veo'
      ? `/api/v1/veo/record-info?taskId=${encodeURIComponent(handle.taskId)}`
      : `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(handle.taskId)}`;

  const json = await call(provider, path, { method: 'GET' });
  const data = (json.data ?? {}) as Record<string, unknown>;

  if (handle.family === 'veo') {
    // successFlag : 0 en cours, 1 réussi, 2 et 3 échoué.
    const flag = Number(data.successFlag ?? 0);
    if (flag === 1) {
      return { status: 'SUCCEEDED', urls: parseUrls(data.resultUrls), costMs: null };
    }
    if (flag === 2 || flag === 3) {
      return {
        status: 'FAILED',
        code: String(data.errorCode ?? flag),
        message: String(data.errorMessage ?? 'La génération a échoué.'),
      };
    }
    return { status: 'RUNNING' };
  }

  const state = String(data.state ?? 'waiting');
  if (state === 'success') {
    return {
      status: 'SUCCEEDED',
      urls: parseUrls(data.resultJson),
      costMs: typeof data.costTime === 'number' ? data.costTime : null,
    };
  }
  if (state === 'fail') {
    return {
      status: 'FAILED',
      code: data.failCode ? String(data.failCode) : null,
      message: String(data.failMsg ?? 'La génération a échoué.'),
    };
  }
  return { status: 'RUNNING' };
}

/**
 * Les URLs arrivent tantôt en tableau, tantôt en JSON encodé dans une chaîne
 * (`resultJson`), tantôt en chaîne JSON simple (`resultUrls` côté Veo). On
 * absorbe les trois plutôt que de faire confiance à une seule forme.
 */
function parseUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((u): u is string => typeof u === 'string');
  if (typeof raw !== 'string') return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string');
    if (parsed && typeof parsed === 'object') {
      const urls = (parsed as { resultUrls?: unknown }).resultUrls;
      if (Array.isArray(urls)) return urls.filter((u): u is string => typeof u === 'string');
    }
  } catch {
    // Chaîne non-JSON : c'est peut-être déjà une URL isolée.
    if (raw.startsWith('http')) return [raw];
  }
  return [];
}
