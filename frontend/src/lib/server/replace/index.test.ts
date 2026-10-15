import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { __resetCloudinarySingleton } from '@/lib/server/upload/cloudinary-client';
import {
  ReplaceInputError,
  composeReplacePrompt,
  finalizeReplace,
  prepareReplaceSource,
} from './index';

const CLOUD = 'deoflow-test';
const VIDEO = `https://res.cloudinary.com/${CLOUD}/video/upload/v1760/references/u1/src.mp4`;
const IMAGE = `https://res.cloudinary.com/${CLOUD}/image/upload/v1760/references/u1/face.png`;
const provider = { apiKey: 'k', baseUrl: 'https://api.kie.ai' };

beforeAll(() => {
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
  __resetCloudinarySingleton();
});

afterAll(() => {
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  __resetCloudinarySingleton();
});

afterEach(() => vi.unstubAllGlobals());

const probeOf = (duration: number, width = 720, height = 1280) =>
  vi.fn().mockResolvedValue({ duration, width, height });

describe('préparation de la source', () => {
  it('facture la durée mesurée chez Cloudinary, coupée à la seconde pleine', async () => {
    const probe = probeOf(6.17);
    const prepared = await prepareReplaceSource(
      'replace',
      { reference_video_urls: [VIDEO], reference_image_urls: [IMAGE] },
      probe,
    );
    expect(probe).toHaveBeenCalledWith('references/u1/src');
    expect(prepared.durationSeconds).toBe(6);
    // kie.ai reçoit la vidéo COUPÉE : il ne peut pas facturer plus que débité.
    expect(prepared.media.reference_video_urls).toEqual([
      expect.stringContaining('/video/upload/du_6/'),
    ]);
    expect(prepared.media.reference_image_urls).toEqual([IMAGE]);
    expect(prepared.ratio).toBe('9:16');
  });

  it('coupe une vidéo trop longue au plafond au lieu de la refuser', async () => {
    const prepared = await prepareReplaceSource(
      'replace',
      { reference_video_urls: [VIDEO] },
      probeOf(22.4, 1920, 1080),
    );
    expect(prepared.durationSeconds).toBe(15);
    expect(prepared.ratio).toBe('16:9');
  });

  it('refuse une vidéo trop courte, avant tout débit', async () => {
    await expect(
      prepareReplaceSource('replace', { reference_video_urls: [VIDEO] }, probeOf(3.6)),
    ).rejects.toMatchObject({ code: 'MEDIA_TOO_SHORT' });
  });

  it('refuse une vidéo qui n’est pas chez nous — elle ne se mesure pas', async () => {
    const probe = probeOf(6);
    await expect(
      prepareReplaceSource(
        'replace',
        { reference_video_urls: ['https://exemple.com/v.mp4'] },
        probe,
      ),
    ).rejects.toBeInstanceOf(ReplaceInputError);
    expect(probe).not.toHaveBeenCalled();
  });

  it('dit « réessayez » si Cloudinary ne répond pas', async () => {
    await expect(
      prepareReplaceSource(
        'replace',
        { reference_video_urls: [VIDEO] },
        vi.fn().mockRejectedValue(new Error('panne')),
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_PROBE_FAILED', status: 503 });
  });
});

describe('composition du prompt', () => {
  it('donne à l’analyse la vidéo coupée et l’image du personnage', async () => {
    const analyze = vi.fn().mockResolvedValue({ motion: '0.0–6.0 s: stands' });
    const trimmed = `https://res.cloudinary.com/${CLOUD}/video/upload/du_6/v1/references/u1/src.mp4`;
    const { prompt, analyzed } = await composeReplacePrompt(
      {
        provider,
        media: { reference_video_urls: [trimmed], reference_image_urls: [IMAGE] },
        seconds: 6,
        note: 'sans le sac',
        avatarDescription: null,
      },
      analyze,
    );
    expect(analyzed).toBe(true);
    expect(analyze).toHaveBeenCalledWith(provider, {
      videoUrl: trimmed,
      imageUrl: expect.stringContaining('/image/upload/c_limit,w_768/'),
      seconds: 6,
    });
    expect(prompt).toContain('0.0–6.0 s: stands');
    expect(prompt).toContain('sans le sac');
  });

  it('garde un prompt complet quand l’analyse échoue', async () => {
    const { prompt, analyzed } = await composeReplacePrompt(
      {
        provider,
        media: { reference_video_urls: [VIDEO], reference_image_urls: [IMAGE] },
        seconds: 6,
        note: '',
        avatarDescription: 'Awa, robe wax',
      },
      vi.fn().mockResolvedValue(null),
    );
    expect(analyzed).toBe(false);
    expect(prompt).toContain('Follow the reference video exactly');
    expect(prompt).toContain('Awa, robe wax');
  });
});

describe('rendu final', () => {
  const stored = {
    secureUrl: `https://res.cloudinary.com/${CLOUD}/video/upload/v2/generations/u1/g1/0.mp4`,
    publicId: 'generations/u1/g1/0',
    duration: 6.583,
  };
  const inputs = {
    reference_video_urls: [
      `https://res.cloudinary.com/${CLOUD}/video/upload/du_6/v1/references/u1/src.mp4`,
    ],
  };
  const ok = {
    ok: true,
    status: 200,
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
  const refused = {
    ok: false,
    status: 400,
    headers: new Headers({ 'x-cld-error': 'no audio' }),
    arrayBuffer: async () => new ArrayBuffer(0),
  };

  it('retient le rendu recalé avec le son d’origine', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok));
    const url = await finalizeReplace({ generationId: 'g1', inputs, durationSeconds: 6, stored });
    expect(url).toContain('e_accelerate:10/ac_none/du_6,l_audio:references:u1:src');
  });

  it('se contente du recalage si la source n’a pas de son', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(refused).mockResolvedValueOnce(ok));
    const url = await finalizeReplace({ generationId: 'g1', inputs, durationSeconds: 6, stored });
    expect(url).toContain('e_accelerate:10/v1/');
    expect(url).not.toContain('l_audio');
  });

  it('sert le rendu brut plutôt que de perdre une génération payée', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('injoignable')));
    expect(await finalizeReplace({ generationId: 'g1', inputs, durationSeconds: 6, stored })).toBe(
      stored.secureUrl,
    );
    // Durée du rendu inconnue : rien à recaler.
    expect(
      await finalizeReplace({
        generationId: 'g1',
        inputs,
        durationSeconds: 6,
        stored: { ...stored, duration: undefined },
      }),
    ).toBe(stored.secureUrl);
  });
});
