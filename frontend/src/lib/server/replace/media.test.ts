import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { __resetCloudinarySingleton } from '@/lib/server/upload/cloudinary-client';
import {
  accelerationPercent,
  closestRatio,
  finalizedResultUrls,
  parseOwnUrl,
  trimmedVideoUrl,
} from './media';

const CLOUD = 'deoflow-test';

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

describe('lecture d’une adresse Cloudinary', () => {
  it('reconnaît nos fichiers, transformations comprises', () => {
    expect(
      parseOwnUrl(`https://res.cloudinary.com/${CLOUD}/video/upload/v1760/references/u1/abc.mp4`),
    ).toEqual({ resourceType: 'video', publicId: 'references/u1/abc' });
    expect(
      parseOwnUrl(`https://res.cloudinary.com/${CLOUD}/video/upload/du_6/v1/references/u1/abc.mp4`),
    ).toEqual({ resourceType: 'video', publicId: 'references/u1/abc' });
  });

  it('refuse ce qui ne se mesure pas chez nous', () => {
    // La durée facturée vient de NOTRE compte : une vidéo hébergée ailleurs
    // ne peut être ni mesurée ni coupée.
    expect(parseOwnUrl('https://res.cloudinary.com/autre/video/upload/v1/a.mp4')).toBeNull();
    expect(parseOwnUrl('https://exemple.com/video.mp4')).toBeNull();
    expect(parseOwnUrl(`http://res.cloudinary.com/${CLOUD}/video/upload/v1/a.mp4`)).toBeNull();
    expect(parseOwnUrl(`https://res.cloudinary.com/${CLOUD}/raw/upload/v1/a.txt`)).toBeNull();
    expect(parseOwnUrl(`https://res.cloudinary.com/${CLOUD}/video/upload/a.mp4`)).toBeNull();
    expect(parseOwnUrl('pas une adresse')).toBeNull();
  });
});

describe('coupe et recalage', () => {
  it('coupe la source à la durée facturée, en MP4', () => {
    const url = trimmedVideoUrl('references/u1/abc', 6);
    expect(url).toContain(`/${CLOUD}/video/upload/du_6/`);
    expect(url).toMatch(/references\/u1\/abc\.mp4$/);
    // Pas de paramètre de statistiques ajouté par le SDK.
    expect(url).not.toContain('?_a=');
  });

  it('calcule l’accélération en pourcentage entier', () => {
    // Essai réel : 6,58 s rendues pour 6 s visées.
    expect(accelerationPercent(6.583, 6)).toBe(10);
    expect(accelerationPercent(6, 6)).toBe(0);
    // Bornes acceptées par Cloudinary.
    expect(accelerationPercent(30, 6)).toBe(100);
    expect(accelerationPercent(1, 6)).toBe(-50);
    expect(accelerationPercent(0, 6)).toBe(0);
  });

  it('recale et remplace le son — puis propose un repli sans son', () => {
    const [withAudio, retimedOnly] = finalizedResultUrls({
      result: { resourceType: 'video', publicId: 'generations/u1/g1/0' },
      renderedSeconds: 6.583,
      sourcePublicId: 'references/u1/abc',
      seconds: 6,
    });
    // Forme vérifiée sur le compte réel : image 6,04 s, son 6,00 s, son de la
    // source à 0,999 de corrélation.
    expect(withAudio).toContain(
      '/video/upload/e_accelerate:10/ac_none/du_6,l_audio:references:u1:abc/fl_layer_apply/',
    );
    expect(retimedOnly).toContain('/video/upload/e_accelerate:10/v1/');
    expect(retimedOnly).not.toContain('l_audio');
  });

  it('ne coupe jamais l’image, seulement le son', () => {
    // Cloudinary applique `du_` AVANT l'accélération : « accélérer puis couper
    // à 6 s » rendait 5,54 s d'image — la fin du mouvement perdue. Constaté
    // lors de l'essai de bout en bout.
    for (const url of finalizedResultUrls({
      result: { resourceType: 'video', publicId: 'g' },
      renderedSeconds: 6.583,
      sourcePublicId: 's',
      seconds: 6,
    })) {
      // Les composants qui précèdent le calque audio sont ceux de l'image.
      const steps = url.split('/upload/')[1]!.split('/');
      const layer = steps.findIndex((s) => s.includes('l_audio'));
      const imageSteps = layer === -1 ? steps : steps.slice(0, layer);
      expect(imageSteps.some((s) => /(^|,)du_\d/.test(s))).toBe(false);
    }
  });

  it('n’accélère pas un rendu déjà à la bonne durée', () => {
    const [url] = finalizedResultUrls({
      result: { resourceType: 'video', publicId: 'g' },
      renderedSeconds: 6.02,
      sourcePublicId: 's',
      seconds: 6,
    });
    expect(url).not.toContain('e_accelerate');
  });
});

describe('format', () => {
  const ratios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];

  it('suit les proportions de la vidéo source', () => {
    expect(closestRatio(720, 1280, ratios)).toBe('9:16');
    expect(closestRatio(1920, 1080, ratios)).toBe('16:9');
    expect(closestRatio(1080, 1080, ratios)).toBe('1:1');
    expect(closestRatio(1080, 1350, ratios)).toBe('3:4');
  });

  it('renonce sans dimensions', () => {
    expect(closestRatio(0, 0, ratios)).toBeNull();
  });
});
