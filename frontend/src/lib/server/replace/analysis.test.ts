import { describe, it, expect, vi, afterEach } from 'vitest';
import { analysisPrompt, analyzeReplace, parseAnalysis } from './analysis';

const provider = { apiKey: 'k', baseUrl: 'https://api.kie.ai' };
const input = {
  videoUrl: 'https://res.cloudinary.com/c/video/upload/du_6/v1/s.mp4',
  imageUrl: 'https://res.cloudinary.com/c/image/upload/w_768/v1/p.jpg',
  seconds: 6,
};

/** Réponse réellement renvoyée par Gemini lors des essais (octobre 2026). */
const REAL_OUTPUT = `CHARACTER: A young woman in her early 20s with rich brown skin, small dark braided hair parted in the middle. She wears a long-sleeved, scoop-neck midi dress featuring diagonal pink and muted yellow stripes.

MOTION
0.0–1.2 s: Facing forward, the character holds the bag down in her right hand and looks directly at the camera.
1.2–2.3 s: The character pivots her lower body to her left into a three-quarter back view.
3.5–4.5 s: The character raises her left hand to touch the back of her head.
4.5–6.0 s: Stepping forward directly toward the camera, she lowers her left hand.

CAMERA:
Medium full shot at chest height, slowly pushing in toward the character.

LOCATION AND LIGHT: A residential indoor hallway with neutral beige walls and light wood flooring.`;

function geminiReply(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
      credits_consumed: 0.17,
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('lecture de l’analyse', () => {
  it('découpe une vraie réponse de Gemini, titre seul sur sa ligne compris', () => {
    const analysis = parseAnalysis(REAL_OUTPUT);
    expect(analysis?.character).toMatch(/^A young woman/);
    expect(analysis?.motion.split('\n')).toHaveLength(4);
    expect(analysis?.camera).toBe(
      'Medium full shot at chest height, slowly pushing in toward the character.',
    );
    expect(analysis?.location).toMatch(/^A residential indoor hallway/);
  });

  it('tolère le Markdown', () => {
    const analysis = parseAnalysis(
      '**MOTION**\n- 0.0–2.0 s: stands\n- 2.0–4.0 s: turns\n**CAMERA:** static',
    );
    expect(analysis?.motion).toContain('0.0–2.0 s: stands');
    expect(analysis?.camera).toBe('static');
  });

  it('ne prend pas une ligne de mouvement pour un titre', () => {
    const analysis = parseAnalysis(
      'MOTION\n0.0–2.0 s: stands\nCharacter turns slowly\n2.0–4.0 s: waves',
    );
    expect(analysis?.motion.split('\n')).toEqual(['0.0–2.0 s: stands', '2.0–4.0 s: waves']);
    expect(analysis?.character).toBeNull();
  });

  it('rejette un mouvement sans repères de temps', () => {
    // Un découpage sans temps ne vaut pas mieux que le gabarit générique.
    expect(parseAnalysis('MOTION\nThe character dances.\nThen waves.')).toBeNull();
    expect(parseAnalysis('Je ne peux pas analyser cette vidéo.')).toBeNull();
  });

  it('demande la description du personnage seulement s’il y a une image', () => {
    expect(analysisPrompt(6, true)).toContain('CHARACTER:');
    expect(analysisPrompt(6, false)).not.toContain('CHARACTER:');
    expect(analysisPrompt(6, true)).toContain('covering 0.0 to 6.0 s');
  });
});

describe('appel à Gemini', () => {
  it('envoie la vidéo à 4 images/s et l’image du personnage, par adresse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiReply(REAL_OUTPUT));
    vi.stubGlobal('fetch', fetchMock);

    const analysis = await analyzeReplace(provider, input);
    expect(analysis?.motion).toContain('three-quarter back view');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.kie.ai/gemini/v1/models/gemini-3-8-flash:streamGenerateContent');
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    const parts = body.contents[0].parts;
    expect(parts).toContainEqual({
      file_data: { mime_type: 'video/mp4', file_uri: input.videoUrl },
      video_metadata: { fps: 4 },
    });
    expect(parts).toContainEqual({
      file_data: { mime_type: 'image/jpeg', file_uri: input.imageUrl },
    });
  });

  it('relance une fois après une erreur passagère de kie.ai', async () => {
    // Constaté : kie.ai répond parfois 200 avec `code: 500`, et le second
    // appel passe.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 500, msg: 'Server exception' }),
      })
      .mockResolvedValueOnce(geminiReply(REAL_OUTPUT));
    vi.stubGlobal('fetch', fetchMock);

    expect(await analyzeReplace(provider, input)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renvoie null au lieu d’échouer — la génération continue sans analyse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('réseau')));
    expect(await analyzeReplace(provider, input)).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply('rien d’utile')));
    expect(await analyzeReplace(provider, input)).toBeNull();
  });

  it('ne relance pas si le temps manque', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('délai'));
    vi.stubGlobal('fetch', fetchMock);
    let t = 0;
    // Le premier essai « dure » 35 s : il ne reste pas de quoi en tenter un second.
    const now = () => t;
    fetchMock.mockImplementationOnce(async () => {
      t += 35_000;
      throw new Error('délai');
    });
    expect(await analyzeReplace(provider, input, now)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
