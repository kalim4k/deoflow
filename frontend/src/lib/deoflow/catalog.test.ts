import { describe, it, expect } from 'vitest';
import { AI_MODELS, findModel } from './catalog';
import { CREDIT_PACKS, findPack, pricePerCredit } from './packs';
import { priceCredits } from './pricing';
import { previewDataUri } from './placeholder';

describe('prix d’une vidéo', () => {
  it('croît avec la durée — c’est ce que l’écran affiche en direct', () => {
    expect(findModel('kling-2-6')).toBeDefined();
    const costs = [3, 10, 30].map((d) => priceCredits('kling-2-6', { seconds: d })!);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe('catalogue', () => {
  it('expose au moins deux modèles image et deux modèles vidéo', () => {
    // Le PRD (risque n°5) impose de ne jamais dépendre d’un seul fournisseur.
    expect(AI_MODELS.filter((m) => m.kind === 'image').length).toBeGreaterThanOrEqual(2);
    expect(AI_MODELS.filter((m) => m.kind === 'video').length).toBeGreaterThanOrEqual(2);
  });

  it('facture chaque modèle en crédits entiers strictement positifs', () => {
    for (const model of AI_MODELS) {
      const price = priceCredits(model.slug, { seconds: 5 });
      expect(price, `${model.slug} sans tarif`).not.toBeNull();
      expect(Number.isInteger(price)).toBe(true);
      expect(price!).toBeGreaterThan(0);
    }
  });

  it('donne des formats à chaque modèle image', () => {
    for (const model of AI_MODELS) {
      if (model.kind === 'image') expect(model.ratios.length).toBeGreaterThan(0);
    }
  });

  it('propose le vertical en premier partout où un format est réglable', () => {
    // La cible publie sur TikTok. Un modèle qui ouvre par défaut en 16:9
    // livre une vidéo inexploitable sans recadrage — donc un crédit dépensé
    // pour rien.
    for (const model of AI_MODELS) {
      if (model.ratios.length === 0) continue;
      expect(model.ratios, `${model.slug} : le 9:16 doit être proposé`).toContain('9:16');
      expect(model.ratios[0], `${model.slug} : le 9:16 doit être le format par défaut`).toBe(
        '9:16',
      );
    }
  });

  it('ne renvoie rien pour un identifiant inconnu', () => {
    expect(findModel('modele-inexistant')).toBeUndefined();
  });
});

describe('packs de crédits', () => {
  it('vend le crédit au tarif kie.ai : 1000 pour 3000 FCFA', () => {
    expect(CREDIT_PACKS.map((p) => [p.credits, p.priceFcfa])).toEqual([
      [1000, 3000],
      [3000, 9000],
      [10000, 30000],
    ]);
  });

  it('stocke des montants FCFA entiers — jamais de décimale', () => {
    for (const pack of CREDIT_PACKS) {
      expect(Number.isInteger(pack.priceFcfa)).toBe(true);
    }
  });

  it('applique le même prix au crédit sur tous les packs', () => {
    // Voir `margin.test.ts` : la marge se prend sur la consommation, donc une
    // remise à l'achat la rognerait sans que rien ne l'annonce.
    expect(CREDIT_PACKS.map(pricePerCredit)).toEqual([3, 3, 3]);
  });

  it('ne renvoie rien pour un pack inconnu', () => {
    expect(findPack('pack-fantome')).toBeUndefined();
  });
});

describe('aperçus simulés', () => {
  it('produit le même visuel pour la même graine', () => {
    expect(previewDataUri('graine', 'image', '1:1')).toBe(previewDataUri('graine', 'image', '1:1'));
  });

  it('produit des visuels différents pour des graines différentes', () => {
    expect(previewDataUri('a', 'image', '1:1')).not.toBe(previewDataUri('b', 'image', '1:1'));
  });

  it('n’embarque aucune ressource distante', () => {
    // Enjeu : la cible est sur une 4G capricieuse. Un aperçu ne doit déclencher
    // aucune requête. La seule URL tolérée est l'espace de noms SVG, qui est un
    // identifiant — le navigateur ne le télécharge jamais.
    const uri = previewDataUri('graine', 'video', null);
    expect(uri.startsWith('data:image/svg+xml')).toBe(true);

    const decoded = decodeURIComponent(uri);
    expect(decoded).not.toContain('<image');
    expect(decoded).not.toContain('href');
    expect(decoded.match(/https?:\/\/[^"']+/g)).toEqual(['http://www.w3.org/2000/svg']);
  });

  it('estampille chaque aperçu comme simulé', () => {
    expect(decodeURIComponent(previewDataUri('graine', 'image', '9:16'))).toContain(
      'aperçu simulé',
    );
  });
});
