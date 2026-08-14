import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MODEL_BINDINGS,
  KieError,
  createTask,
  getTask,
  tryCreateKieProvider,
  type KieProvider,
} from './kie';
import { AI_MODELS } from '@/lib/deoflow/catalog';

const provider: KieProvider = { apiKey: 'test-key', baseUrl: 'https://api.kie.ai' };

function mockJson(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

/** Corps JSON du dernier POST — c'est ce que kie.ai reçoit réellement. */
function lastBody(): Record<string, unknown> {
  const call = vi.mocked(fetch).mock.calls.at(-1)!;
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

function lastInput(): Record<string, unknown> {
  return lastBody().input as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockJson({ code: 200, data: { taskId: 't-1' } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.KIE_API_KEY;
});

describe('configuration', () => {
  it('reste inerte sans clé — les routes doivent pouvoir répondre 503', () => {
    expect(tryCreateKieProvider()).toBeUndefined();
  });

  it('s’active dès que la clé est présente', () => {
    process.env.KIE_API_KEY = 'k';
    expect(tryCreateKieProvider()?.apiKey).toBe('k');
  });
});

describe('correspondance catalogue ↔ fournisseur', () => {
  it('couvre tous les modèles vendus', () => {
    // Vendre un modèle sans savoir l'appeler produirait une erreur au clic,
    // après avoir débité l'utilisateur. Ce test est le garde-fou.
    for (const model of AI_MODELS) {
      expect(MODEL_BINDINGS[model.slug], `binding manquant : ${model.slug}`).toBeDefined();
    }
  });

  it('n’annonce que des formats acceptés par l’API', () => {
    for (const model of AI_MODELS) {
      const binding = MODEL_BINDINGS[model.slug]!;
      for (const ratio of model.ratios) {
        expect(binding.ratios, `${model.slug} : format ${ratio} refusé`).toContain(ratio);
      }
    }
  });
});

describe('createTask — construction de la requête', () => {
  it('poste sur l’endpoint « jobs » avec l’identifiant exact du modèle', async () => {
    const handle = await createTask(provider, { modelSlug: 'nano-banana-2', prompt: 'un chat' });

    expect(handle).toEqual({ taskId: 't-1', family: 'jobs' });
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    expect(lastBody().model).toBe('nano-banana-2');
    expect(lastInput().prompt).toBe('un chat');
    // Qualité verrouillée en entrée de gamme, jamais exposée au créateur.
    expect(lastInput().resolution).toBe('1K');
    expect(lastInput().output_format).toBe('jpg');
  });

  it('bascule Veo sur son endpoint dédié, sans objet input', async () => {
    const handle = await createTask(provider, {
      modelSlug: 'veo-3-1',
      prompt: 'un plan large',
      aspectRatio: '9:16',
    });

    expect(handle.family).toBe('veo');
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://api.kie.ai/api/v1/veo/generate');
    // La variante Lite, pas Quality : `veo3` coûterait huit fois plus cher
    // chez le fournisseur pour le prix affiché ici.
    expect(lastBody().model).toBe('veo3_lite');
    expect(lastBody().aspect_ratio).toBe('9:16');
    expect(lastBody().input).toBeUndefined();
  });

  it('déclare le mode de génération de Veo au lieu de le laisser deviner', async () => {
    // Deux images peuvent vouloir dire « début et fin » ou « références ».
    // Sans `generationType`, kie.ai tranche seul — donc se trompe une fois
    // sur deux, après débit.
    const deux = ['https://cdn/a.png', 'https://cdn/b.png'];

    await createTask(provider, {
      modelSlug: 'veo-3-1',
      mode: 'frames',
      prompt: 'une transition',
      media: { imageUrls: deux },
    });
    expect(lastBody().generationType).toBe('FIRST_AND_LAST_FRAMES_2_VIDEO');
    expect(lastBody().imageUrls).toEqual(deux);

    await createTask(provider, {
      modelSlug: 'veo-3-1',
      mode: 'references',
      prompt: 'un personnage dans un décor',
      media: { imageUrls: deux },
    });
    expect(lastBody().generationType).toBe('REFERENCE_2_VIDEO');
  });

  it('déclare aussi le mode texte, sans image', async () => {
    await createTask(provider, { modelSlug: 'veo-3-1', mode: 'text', prompt: 'un plan large' });
    expect(lastBody().generationType).toBe('TEXT_2_VIDEO');
    expect(lastBody().imageUrls).toBeUndefined();
  });

  it('n’envoie pas plus d’images que le mode n’en accepte', async () => {
    // Le mode « début et fin » plafonne à 2 : une troisième image serait
    // refusée par le fournisseur, après débit.
    await createTask(provider, {
      modelSlug: 'veo-3-1',
      mode: 'frames',
      prompt: 'une transition',
      media: { imageUrls: ['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/c.png'] },
    });
    expect((lastBody().imageUrls as string[]).length).toBe(2);
  });

  it('transmet la définition choisie pour Veo, à plat', async () => {
    await createTask(provider, {
      modelSlug: 'veo-3-1',
      prompt: 'un plan large',
      params: { resolution: '1080p' },
    });
    expect(lastBody().resolution).toBe('1080p');
  });

  it('remplace une définition Veo hors liste par la moins chère', async () => {
    // Le prix, lui, retombe aussi sur 720p (voir `margin.test.ts`) : les deux
    // doivent retomber sur la MÊME valeur, sinon on produit un rendu 4K en le
    // facturant au tarif 720p.
    await createTask(provider, {
      modelSlug: 'veo-3-1',
      prompt: 'un plan large',
      params: { resolution: '4k' },
    });
    expect(lastBody().resolution).toBe('720p');
  });

  it('écrit chaque média sous la clé exacte de son emplacement', async () => {
    await createTask(provider, {
      modelSlug: 'seedance-2-5',
      mode: 'references',
      prompt: 'une danse',
      media: {
        reference_image_urls: ['https://cdn/a.png', 'https://cdn/b.png'],
        reference_video_urls: ['https://cdn/m.mp4'],
        reference_audio_urls: ['https://cdn/s.mp3'],
      },
    });

    const input = lastInput();
    expect(input.reference_image_urls).toEqual(['https://cdn/a.png', 'https://cdn/b.png']);
    expect(input.reference_video_urls).toEqual(['https://cdn/m.mp4']);
    expect(input.reference_audio_urls).toEqual(['https://cdn/s.mp3']);
  });

  it('passe une chaîne pour une image clé et un tableau pour des références', async () => {
    // Seedance mélange les deux formes : se tromper est refusé côté API.
    await createTask(provider, {
      modelSlug: 'seedance-2-5',
      mode: 'frames',
      prompt: 'x',
      media: { first_frame_url: ['https://cdn/first.png'] },
    });

    expect(lastInput().first_frame_url).toBe('https://cdn/first.png');
    expect(lastInput().last_frame_url).toBeUndefined();
  });

  it('n’envoie jamais plus de fichiers que l’emplacement n’en accepte', async () => {
    await createTask(provider, {
      modelSlug: 'seedance-2-5',
      mode: 'references',
      prompt: 'x',
      media: { reference_image_urls: ['a', 'b', 'c', 'd', 'e', 'f'] },
    });

    expect(lastInput().reference_image_urls).toHaveLength(4);
  });

  it('transmet l’orientation choisie pour Kling au lieu de l’imposer', async () => {
    // Le mode « video » est ce qui autorise 30 s. Le figer priverait le
    // modèle des deux tiers de sa capacité.
    await createTask(provider, {
      modelSlug: 'kling-2-6',
      prompt: 'danse',
      params: { character_orientation: 'video' },
      media: { input_urls: ['https://cdn/p.png'], video_urls: ['https://cdn/m.mp4'] },
    });

    expect(lastInput().character_orientation).toBe('video');
    expect(lastInput().mode).toBe('720p');
  });

  it('remplace une valeur de paramètre inconnue par le défaut déclaré', async () => {
    await createTask(provider, {
      modelSlug: 'kling-2-6',
      prompt: 'danse',
      params: { character_orientation: 'peu importe' },
      media: { input_urls: ['https://cdn/p.png'], video_urls: ['https://cdn/m.mp4'] },
    });

    expect(lastInput().character_orientation).toBe('image');
  });

  it('respecte l’interrupteur de son de Seedance', async () => {
    await createTask(provider, {
      modelSlug: 'seedance-2-5',
      prompt: 'x',
      params: { generate_audio: false },
    });
    expect(lastInput().generate_audio).toBe(false);
  });

  it('envoie la durée en chaîne pour Gemini Omni et en nombre pour Seedance', async () => {
    await createTask(provider, {
      modelSlug: 'gemini-omni-flash',
      prompt: 'x',
      durationSeconds: 6,
    });
    expect(lastInput().duration).toBe('6');

    await createTask(provider, { modelSlug: 'seedance-2-5', prompt: 'x', durationSeconds: 22 });
    expect(lastInput().duration).toBe(22);
  });

  it('n’envoie aucune durée là où l’API n’en prend pas', async () => {
    await createTask(provider, {
      modelSlug: 'kling-2-6',
      prompt: 'x',
      durationSeconds: 12,
      media: { input_urls: ['https://cdn/p.png'], video_urls: ['https://cdn/m.mp4'] },
    });
    expect(lastInput().duration).toBeUndefined();
  });

  it('ignore un format que le modèle ne connaît pas plutôt que de le transmettre', async () => {
    // Gemini Omni n'accepte que 16:9 et 9:16 ; envoyer 1:1 ferait échouer la
    // tâche APRÈS débit du créateur.
    await createTask(provider, { modelSlug: 'gemini-omni-flash', prompt: 'x', aspectRatio: '1:1' });
    expect(lastInput().aspect_ratio).toBe('16:9');
  });
});

describe('createTask — refus avant appel réseau', () => {
  it('refuse Kling sans image ET vidéo de référence', async () => {
    await expect(
      createTask(provider, { modelSlug: 'kling-2-6', prompt: 'danse' }),
    ).rejects.toBeInstanceOf(KieError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuse un mode « au moins un fichier » resté vide', async () => {
    await expect(
      createTask(provider, { modelSlug: 'seedance-2-5', mode: 'references', prompt: 'x' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_BAD_REQUEST' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuse un modèle absent de la table de correspondance', async () => {
    await expect(
      createTask(provider, { modelSlug: 'modele-fantome', prompt: 'x' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_BAD_REQUEST' });
  });

  it('distingue le compte kie.ai à sec du solde de l’utilisateur', async () => {
    vi.stubGlobal('fetch', mockJson({ code: 402, msg: 'no funds' }, 402));
    await expect(
      createTask(provider, { modelSlug: 'nano-banana-2', prompt: 'x' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_OUT_OF_FUNDS' });
  });

  it('traite un code métier ≠ 200 renvoyé avec un HTTP 200 comme une erreur', async () => {
    vi.stubGlobal('fetch', mockJson({ code: 422, msg: 'bad params' }, 200));
    await expect(
      createTask(provider, { modelSlug: 'nano-banana-2', prompt: 'x' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_BAD_REQUEST' });
  });
});

describe('getTask', () => {
  it('normalise l’état « waiting » de la famille jobs', async () => {
    vi.stubGlobal('fetch', mockJson({ code: 200, data: { state: 'waiting' } }));
    expect(await getTask(provider, { taskId: 't', family: 'jobs' })).toEqual({ status: 'RUNNING' });
  });

  it('extrait les URLs du resultJson encodé en chaîne', async () => {
    vi.stubGlobal(
      'fetch',
      mockJson({
        code: 200,
        data: {
          state: 'success',
          resultJson: JSON.stringify({ resultUrls: ['https://cdn/a.png'] }),
          costTime: 4200,
        },
      }),
    );
    expect(await getTask(provider, { taskId: 't', family: 'jobs' })).toEqual({
      status: 'SUCCEEDED',
      urls: ['https://cdn/a.png'],
      costMs: 4200,
    });
  });

  it('remonte le motif d’échec plutôt qu’un message générique', async () => {
    vi.stubGlobal(
      'fetch',
      mockJson({ code: 200, data: { state: 'fail', failCode: '500', failMsg: 'moteur saturé' } }),
    );
    expect(await getTask(provider, { taskId: 't', family: 'jobs' })).toMatchObject({
      status: 'FAILED',
      code: '500',
      message: 'moteur saturé',
    });
  });

  it('interroge l’endpoint Veo et lit successFlag', async () => {
    vi.stubGlobal(
      'fetch',
      mockJson({ code: 200, data: { successFlag: 1, resultUrls: '["https://cdn/v.mp4"]' } }),
    );
    const state = await getTask(provider, { taskId: 't', family: 'veo' });

    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
      'https://api.kie.ai/api/v1/veo/record-info?taskId=t',
    );
    expect(state).toMatchObject({ status: 'SUCCEEDED', urls: ['https://cdn/v.mp4'] });
  });

  it('traite successFlag 2 et 3 comme des échecs', async () => {
    for (const flag of [2, 3]) {
      vi.stubGlobal('fetch', mockJson({ code: 200, data: { successFlag: flag } }));
      expect(await getTask(provider, { taskId: 't', family: 'veo' })).toMatchObject({
        status: 'FAILED',
      });
    }
  });
});
