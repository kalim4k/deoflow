/**
 * Analyse de la vidéo source et du personnage, par Gemini via kie.ai.
 *
 * C'est l'étape qui fait d'un remplacement correct un remplacement réussi : lors
 * de l'essai fondateur, le même gabarit sans découpage a pris une demi-seconde
 * de retard sur les gestes et arrêté le pivot de trois quarts au lieu du dos.
 * Un humain avait écrit ce découpage ; ici, Gemini le fait — même clé kie.ai,
 * aucun compte de plus.
 *
 * Choix retenus après essais (octobre 2026) :
 *   - la VIDÉO elle-même plutôt que des images extraites : plus de détails
 *     (main sur la hanche, regard), six fois moins cher (≈ 0,1 crédit) ;
 *   - 4 images/s (`video_metadata.fps`) : à 1 image/s, la valeur par défaut,
 *     le rapprochement de caméra final passait inaperçu ;
 *   - l'image du personnage dans le MÊME appel : sa description, en anglais
 *     précis, a nettement aidé le rendu ;
 *   - réflexion « low » : « high » n'a rien apporté, en deux fois plus de temps.
 *
 * Ne bloque jamais une génération : tout échec renvoie `null`, et le gabarit
 * générique prend le relais — il donne déjà un remplacement correct.
 */
import 'server-only';
import { log } from '@/lib/server/observability/log';
import type { KieProvider } from '@/lib/server/ai/kie';
import type { ReplaceAnalysis } from '@/lib/deoflow/replacePrompt';

const MODEL = 'gemini-3-8-flash';
const VIDEO_FPS = 4;
/** Un appel dure 10 à 15 s ; au-delà de 25, il ne reviendra pas utilement. */
const ATTEMPT_TIMEOUT_MS = 25_000;
/** La requête de génération attend cette analyse : on ne la retient pas plus. */
const TOTAL_BUDGET_MS = 40_000;
/** Une nouvelle tentative n'est lancée que s'il reste au moins ce temps. */
const MIN_ATTEMPT_MS = 12_000;

export interface AnalysisInput {
  /** La source coupée, en MP4 — la même que reçoit MiniMax. */
  videoUrl: string;
  /** Le personnage, en JPEG ; `null` s'il n'est pas lisible chez nous. */
  imageUrl: string | null;
  seconds: number;
}

export function analysisPrompt(seconds: number, withImage: boolean): string {
  const end = `${seconds.toFixed(1)} s`;
  return [
    `You are the analyst of a video-to-video character replacement pipeline. You receive a ${seconds}-second source video${withImage ? ' and a reference image of the character who will replace the person in it' : ''}.`,
    '',
    'Write exactly these sections, in English, plain text, nothing else:',
    ...(withImage
      ? [
          'CHARACTER: one or two sentences describing the person in the reference image precisely enough to recognise them: apparent age range, skin tone, hairstyle and hair color, notable accessories, overall build in neutral words, and the full outfit with colors and patterns. Ignore the image’s background and pose.',
        ]
      : []),
    'MOTION',
    `4 to 8 lines "start–end s: ..." covering 0.0 to ${end} without gaps, timings precise to 0.1 s. List EVERY distinct action of the main person in order — do not merge or skip any: weight shifts, steps, turns (direction and how far: profile, back to camera), every hand gesture (touching the face, hand on the head, running fingers through or flipping the hair, hand on the hip), head tilts and where the eyes look. Say which hand does what from the person’s own point of view: when they face the camera, their right hand appears on the LEFT of the frame. Mention a held object only by its role ("the bag in the right hand").`,
    'CAMERA: one line — framing at the start, camera height, and every movement (static, push-in, pan) with its timing and the framing it ends on.',
    'LOCATION AND LIGHT: one line describing the place, its main surfaces and colors, and the light.',
    '',
    'In MOTION, CAMERA and LOCATION AND LIGHT, never describe the person of the video — no face, hair, skin, ethnicity, body shape or clothing — and refer to them only as "the character".',
  ].join('\n');
}

type Section = 'character' | 'motion' | 'camera' | 'location';

/**
 * Un titre est un mot-clé SEUL sur sa ligne, ou suivi de « : ». « Character
 * stands facing the camera » est une ligne de mouvement, pas un titre.
 */
const HEADER = /^(CHARACTER|MOTION|CAMERA|LOCATION(?: AND LIGHT)?)\s*(?::\s*(.*))?$/i;

function sectionOf(keyword: string): Section {
  const upper = keyword.toUpperCase();
  if (upper === 'CHARACTER') return 'character';
  if (upper === 'MOTION') return 'motion';
  if (upper === 'CAMERA') return 'camera';
  return 'location';
}

/** Une ligne de mouvement digne de ce nom porte un intervalle de temps. */
const TIMED_LINE = /\d+(?:[.,]\d+)?\s*[–—-]\s*\d+(?:[.,]\d+)?\s*s\b/;

/**
 * Découpe la réponse en sections. Tolère le Markdown (`**MOTION**`, `## …`) et
 * un titre suivi de son contenu à la ligne — les deux formes sont sorties lors
 * des essais. `null` si le mouvement manque ou ne porte aucun temps : un
 * découpage sans repères ne vaut pas mieux que le gabarit générique.
 */
export function parseAnalysis(text: string): ReplaceAnalysis | null {
  const sections: Record<Section, string[]> = {
    character: [],
    motion: [],
    camera: [],
    location: [],
  };
  let current: Section | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/[*#`_]/g, '').trim();
    if (!line) continue;
    const header = HEADER.exec(line);
    if (header?.[1]) {
      current = sectionOf(header[1]);
      const rest = header[2]?.trim();
      if (rest) sections[current].push(rest);
      continue;
    }
    if (current) sections[current].push(line);
  }

  const motionLines = sections.motion.filter((l) => TIMED_LINE.test(l));
  if (motionLines.length < 2) return null;

  const join = (lines: string[]) => lines.join(' ').trim() || null;
  return {
    character: join(sections.character),
    motion: motionLines.join('\n'),
    camera: join(sections.camera),
    location: join(sections.location),
  };
}

interface GeminiResponse {
  code?: number;
  msg?: string;
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  credits_consumed?: number;
}

/** Un essai. Lève sur toute réponse inexploitable — l'appelant décide de relancer. */
async function attempt(
  provider: KieProvider,
  input: AnalysisInput,
  timeoutMs: number,
): Promise<string> {
  const parts: Record<string, unknown>[] = [
    { text: analysisPrompt(input.seconds, input.imageUrl !== null) },
    { text: 'Source video:' },
    {
      file_data: { mime_type: 'video/mp4', file_uri: input.videoUrl },
      video_metadata: { fps: VIDEO_FPS },
    },
  ];
  if (input.imageUrl) {
    parts.push(
      { text: 'Reference image of the character:' },
      { file_data: { mime_type: 'image/jpeg', file_uri: input.imageUrl } },
    );
  }

  const res = await fetch(`${provider.baseUrl}/gemini/v1/models/${MODEL}:streamGenerateContent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stream: false,
      contents: [{ role: 'user', parts }],
      generationConfig: { thinkingConfig: { includeThoughts: false, thinkingLevel: 'low' } },
    }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = (await res.json()) as GeminiResponse;
  // kie.ai répond 200 même en erreur, avec un code métier dans le corps.
  if (body.code !== undefined && body.code !== 200) {
    throw new Error(`kie.ai ${body.code} ${body.msg ?? ''}`.trim());
  }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new Error('réponse vide');
  return text;
}

/**
 * Analyse la vidéo et le personnage. `null` en cas d'échec — jamais d'erreur.
 *
 * Relance une fois si le temps le permet : kie.ai renvoie parfois une erreur
 * 500 passagère (constaté lors des essais), qui passe au second appel.
 */
export async function analyzeReplace(
  provider: KieProvider,
  input: AnalysisInput,
  now: () => number = Date.now,
): Promise<ReplaceAnalysis | null> {
  const deadline = now() + TOTAL_BUDGET_MS;

  for (let tries = 1; tries <= 2; tries += 1) {
    const remaining = deadline - now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      const text = await attempt(provider, input, Math.min(ATTEMPT_TIMEOUT_MS, remaining));
      const analysis = parseAnalysis(text);
      if (analysis) return analysis;
      log.warn('replace: analyse inexploitable', { tries, excerpt: text.slice(0, 200) });
    } catch (err) {
      log.warn('replace: analyse impossible', {
        tries,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
