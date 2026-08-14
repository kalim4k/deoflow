import { describe, it, expect } from 'vitest';
import { GenerationRequestError, quoteGeneration } from './service';
import { priceCredits } from '@/lib/deoflow/pricing';

/**
 * Le devis est le seul rempart entre un client modifié et la facture kie.ai.
 * Un navigateur peut annoncer ce qu'il veut : c'est ce calcul qui décide.
 */
const base = { userId: 'u1', prompt: 'un plan large' };

describe('modèles', () => {
  it('facture une image au tarif du modèle, sans durée', () => {
    expect(quoteGeneration({ ...base, modelSlug: 'nano-banana-2' })).toEqual({
      credits: priceCredits('nano-banana-2')!,
      durationSeconds: null,
    });
  });

  it('refuse un modèle absent du catalogue', () => {
    expect(() => quoteGeneration({ ...base, modelSlug: 'modele-fantome' })).toThrow(
      GenerationRequestError,
    );
  });
});

describe('durées', () => {
  it('ignore la durée annoncée quand le modèle impose la sienne', () => {
    // Veo produit un clip de longueur fixe : accepter « 1 seconde » ferait
    // payer 6 crédits pour un rendu qui en coûte 48.
    expect(quoteGeneration({ ...base, modelSlug: 'veo-3-1', durationSeconds: 1 })).toEqual({
      credits: priceCredits('veo-3-1', { seconds: 8 })!,
      durationSeconds: 8,
    });
  });

  it('refuse une durée hors de la liste proposée', () => {
    // Gemini Omni n'accepte que 4/6/8/10 : facturer 5 s produirait un échec
    // chez le fournisseur, après débit.
    expect(() =>
      quoteGeneration({ ...base, modelSlug: 'gemini-omni-flash', durationSeconds: 5 }),
    ).toThrow(GenerationRequestError);
  });

  it('refuse une durée hors de la plage autorisée', () => {
    expect(() =>
      quoteGeneration({ ...base, modelSlug: 'seedance-2-5', durationSeconds: 45 }),
    ).toThrow(GenerationRequestError);
  });

  it('facture Seedance à la seconde demandée, dans sa plage', () => {
    expect(quoteGeneration({ ...base, modelSlug: 'seedance-2-5', durationSeconds: 22 })).toEqual({
      credits: priceCredits('seedance-2-5', { seconds: 22 })!,
      durationSeconds: 22,
    });
  });

  it('retombe sur le plancher facturable quand aucune durée n’est fournie', () => {
    expect(quoteGeneration({ ...base, modelSlug: 'seedance-2-5' })).toEqual({
      credits: priceCredits('seedance-2-5', { seconds: 1 })!,
      durationSeconds: 1,
    });
  });
});

describe('plafond des emplacements qui portent la durée', () => {
  it('borne Kling au maximum du mode choisi', () => {
    // Le client annonce 300 s ; le mode « comme sur l'image » plafonne à 10.
    // Sans ce bornage, un client modifié ferait produire un clip long en le
    // faisant payer comme un court — ou l'inverse.
    expect(
      quoteGeneration({
        ...base,
        modelSlug: 'kling-2-6',
        durationSeconds: 300,
        params: { character_orientation: 'image' },
      }),
    ).toEqual({ credits: priceCredits('kling-2-6', { seconds: 10 })!, durationSeconds: 10 });

    expect(
      quoteGeneration({
        ...base,
        modelSlug: 'kling-2-6',
        durationSeconds: 300,
        params: { character_orientation: 'video' },
      }),
    ).toEqual({ credits: priceCredits('kling-2-6', { seconds: 30 })!, durationSeconds: 30 });
  });

  it('laisse passer une durée inférieure au plafond', () => {
    expect(quoteGeneration({ ...base, modelSlug: 'kling-2-6', durationSeconds: 7 })).toEqual({
      credits: priceCredits('kling-2-6', { seconds: 7 })!,
      durationSeconds: 7,
    });
  });
});
