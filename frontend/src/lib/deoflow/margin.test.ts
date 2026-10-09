import { describe, it, expect } from 'vitest';
import { AI_MODELS } from './catalog';
import { CREDIT_PACKS, pricePerCredit } from './packs';
import { CREDIT_FCFA, MARGIN, hasVideoInput, kieCost, priceCredits } from './pricing';
import { REFERENCE_VIDEO_MAX_SECONDS, capabilitiesFor, minBillableSeconds } from './capabilities';

/**
 * Ce fichier protège la marge, pas le code.
 *
 * Le crédit Deoflow vaut le crédit kie.ai : ce qu'on vend 3 crédits nous en
 * coûte 1. L'égalité tient tant que deux choses restent vraies — le crédit
 * s'achète au même prix qu'à la source, et chaque génération se facture
 * exactement `MARGIN` fois son coût. Les deux dérivent sans bruit dès qu'on
 * touche une grille ; ces tests les tiennent.
 */
describe('valeur du crédit', () => {
  it('s’achète au tarif de kie.ai : 1000 crédits pour 3000 FCFA', () => {
    // 5 $ = 1000 crédits chez kie.ai. Vendre le crédit plus cher ferait une
    // marge invisible en plus des 3× ; moins cher les rognerait en silence.
    for (const pack of CREDIT_PACKS) {
      expect(pricePerCredit(pack)).toBe(CREDIT_FCFA);
      // Le prix est un montant rond, les crédits en découlent au crédit
      // supérieur : l'écart reste sous un crédit, et toujours au profit de
      // l'acheteur. Un écart plus large serait une remise ou un surcoût caché.
      expect(pack.credits).toBe(Math.ceil(pack.priceFcfa / CREDIT_FCFA));
      const gap = pack.credits * CREDIT_FCFA - pack.priceFcfa;
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThan(CREDIT_FCFA);
    }
  });

  it('ne remise aucun pack', () => {
    // La marge se prend sur la consommation. Une remise à l'achat la
    // réduirait d'autant, et aucun test de prix ne le verrait.
    const rates = new Set(CREDIT_PACKS.map(pricePerCredit));
    expect(rates.size).toBe(1);
  });
});

describe('prix de vente', () => {
  const seconds = 10;

  it.each(AI_MODELS.filter((m) => m.active).map((m) => m.slug))(
    '%s se vend exactement %s fois son coût',
    (slug) => {
      for (const withVideo of [false, true]) {
        const cost = kieCost(slug, { seconds, hasVideoInput: withVideo });
        const price = priceCredits(slug, { seconds, hasVideoInput: withVideo });
        expect(cost, `${slug} sans coût déclaré`).not.toBeNull();
        expect(price).toBe(Math.ceil(cost! * MARGIN));
      }
    },
  );

  it('refuse de deviner le prix d’un modèle inconnu', () => {
    // Renvoyer 0 ferait une génération gratuite ; renvoyer une valeur par
    // défaut ferait payer autre chose que ce qui est affiché.
    expect(priceCredits('modele-fantome', { seconds: 5 })).toBeNull();
  });

  it('arrondit au crédit supérieur', () => {
    // Gemini Omni coûte 10,5 crédits la seconde : arrondir vers le bas
    // perdrait une fraction sur chaque génération.
    expect(priceCredits('gemini-omni-flash', { seconds: 4 })).toBe(189);
    expect(Number.isInteger(priceCredits('gemini-omni-flash', { seconds: 5 }))).toBe(true);
  });

  it('affiche un prix plancher pour chaque modèle du catalogue', () => {
    for (const m of AI_MODELS.filter((x) => x.active)) {
      const floor = priceCredits(m.slug, {
        seconds: minBillableSeconds(m.slug),
        hasVideoInput: false,
      });
      expect(floor, `${m.slug} sans prix plancher`).toBeGreaterThan(0);
    }
  });
});

describe('facturation propre à chaque fournisseur', () => {
  it('facture Seedance sur l’entrée ET la sortie quand une vidéo est jointe', () => {
    // 38 crédits/s paraissent moins chers que 63, mais portent deux fois la
    // durée : joindre une vidéo coûte PLUS cher, pas moins. Aplatir ça en un
    // tarif unique à la seconde était le défaut de la première grille.
    const sansVideo = kieCost('seedance-2-5', { seconds: 10, hasVideoInput: false });
    const avecVideo = kieCost('seedance-2-5', { seconds: 10, hasVideoInput: true });
    expect(sansVideo).toBe(630);
    expect(avecVideo).toBe(760);
    expect(avecVideo!).toBeGreaterThan(sansVideo!);
  });

  it('reproduit le barème publié de MiniMax H3', () => {
    // 8 crédits la seconde en 768P, la définition que `kie.ts` verrouille.
    // Si quelqu'un ouvrait le 2K sans toucher à la grille, le coût réel
    // passerait à 13 — et rien ici ne bougerait. D'où le verrou côté serveur.
    expect(kieCost('minimax-h3', { seconds: 4 })).toBe(32);
    expect(kieCost('minimax-h3', { seconds: 15 })).toBe(120);
  });

  it('ajoute la durée de la vidéo de référence à la facture MiniMax', () => {
    // Le serveur ne mesure pas les fichiers envoyés : il facture le plafond
    // autorisé par l'emplacement. Ce test attache le prix à CETTE constante,
    // de sorte qu'élargir l'emplacement sans toucher à la grille — donc vendre
    // à perte — fasse échouer la suite au lieu de passer inaperçu.
    const sans = kieCost('minimax-h3', { seconds: 4, hasVideoInput: false })!;
    const avec = kieCost('minimax-h3', { seconds: 4, hasVideoInput: true })!;
    expect(avec - sans).toBe(8 * REFERENCE_VIDEO_MAX_SECONDS);
    expect(avec).toBeGreaterThan(sans);
  });

  it('n’expose jamais assez d’images de référence pour déclencher le supplément', () => {
    // kie.ai offre les 5 premières images et facture 4 crédits au-delà. Le
    // supplément n'est pas modélisé dans la grille — il n'a donc pas le droit
    // d'être atteignable.
    const slot = capabilitiesFor('minimax-h3')
      ?.modes.flatMap((mode) => mode.slots)
      .find((s) => s.key === 'reference_image_urls');
    expect(slot?.maxCount).toBeLessThanOrEqual(5);
  });

  it('reproduit le barème publié de Seedream 5.0 Pro', () => {
    // 7 crédits l'image en 1K, texte seul comme à partir d'une image : la
    // première image d'entrée est incluse.
    expect(kieCost('seedream-5-pro')).toBe(7);
    expect(kieCost('seedream-5-pro', { inputImages: 1 })).toBe(7);
    expect(priceCredits('seedream-5-pro', { inputImages: 1 })).toBe(21);
  });

  it('facture chaque image d’entrée de Seedream au-delà de la première', () => {
    // 0,5 crédit kie.ai par image supplémentaire. L'ignorer ferait vendre à
    // perte chaque fusion de plusieurs photos — en silence.
    expect(kieCost('seedream-5-pro', { inputImages: 2 })).toBe(7.5);
    expect(kieCost('seedream-5-pro', { inputImages: 10 })).toBe(11.5);
    expect(priceCredits('seedream-5-pro', { inputImages: 2 })).toBe(23);
    expect(priceCredits('seedream-5-pro', { inputImages: 10 })).toBe(35);
  });

  it('n’applique ce supplément qu’aux modèles qui le facturent', () => {
    expect(kieCost('nano-banana-2', { inputImages: 10 })).toBe(8);
  });

  it('reproduit le barème publié de Gemini Omni', () => {
    // Valeurs de la fiche kie.ai, à recopier telles quelles : c'est le seul
    // moyen de voir tout de suite si le fournisseur change son barème.
    expect(kieCost('gemini-omni-flash', { seconds: 4 })).toBe(63);
    expect(kieCost('gemini-omni-flash', { seconds: 6 })).toBe(84);
    expect(kieCost('gemini-omni-flash', { seconds: 8 })).toBe(105);
    expect(kieCost('gemini-omni-flash', { seconds: 10 })).toBe(126);
    // Forfait dès qu'une vidéo entre, quelle que soit la durée demandée.
    expect(kieCost('gemini-omni-flash', { seconds: 4, hasVideoInput: true })).toBe(168);
    expect(kieCost('gemini-omni-flash', { seconds: 10, hasVideoInput: true })).toBe(168);
  });

  it('ignore la durée là où le fournisseur l’impose', () => {
    // Veo facture au clip : facturer à la seconde ferait payer un clip court au
    // prix d'un long, ou l'inverse.
    expect(kieCost('veo-3-1', { seconds: 1 })).toBe(30);
    expect(kieCost('veo-3-1', { seconds: 30 })).toBe(30);
  });

  it('répercute la définition choisie chez Veo', () => {
    // Le créateur voit un sélecteur 720p / 1080p : s'il ne changeait pas le
    // prix, on afficherait un montant et on en prélèverait un autre.
    expect(kieCost('veo-3-1', { params: { resolution: '720p' } })).toBe(30);
    expect(kieCost('veo-3-1', { params: { resolution: '1080p' } })).toBe(35);
    expect(priceCredits('veo-3-1', { params: { resolution: '720p' } })).toBe(90);
    expect(priceCredits('veo-3-1', { params: { resolution: '1080p' } })).toBe(105);
  });

  it('retombe sur la définition la moins chère si le réglage est absent ou inventé', () => {
    // Un client modifié qui annonce « 4k » ne doit pas obtenir un tarif 720p
    // sur un rendu plus cher : la valeur hors liste est ignorée des deux côtés
    // — ici pour le prix, et dans `kie.ts` pour la requête envoyée.
    expect(kieCost('veo-3-1')).toBe(30);
    expect(kieCost('veo-3-1', { params: { resolution: '4k' } })).toBe(30);
  });

  it('facture Kling à la seconde', () => {
    expect(kieCost('kling-2-6', { seconds: 30 })).toBe(330);
    expect(priceCredits('kling-2-6', { seconds: 30 })).toBe(990);
  });

  it('ignore la durée pour une image', () => {
    expect(kieCost('nano-banana-2', { seconds: 99 })).toBe(8);
    expect(priceCredits('nano-banana-2')).toBe(24);
    expect(priceCredits('gpt-image-2')).toBe(18);
  });
});

describe('détection d’une vidéo de référence', () => {
  it('reconnaît une vidéo à son URL de stockage', () => {
    // Le type vient du stockage, pas d'une déclaration du navigateur : c'est
    // ce qui rend la détection non falsifiable côté client.
    expect(
      hasVideoInput({ video_urls: ['https://res.cloudinary.com/c/video/upload/v1/a.mp4'] }),
    ).toBe(true);
  });

  it('ne prend pas une image pour une vidéo', () => {
    expect(
      hasVideoInput({ input_urls: ['https://res.cloudinary.com/c/image/upload/v1/a.png'] }),
    ).toBe(false);
    expect(hasVideoInput({})).toBe(false);
    expect(hasVideoInput(undefined)).toBe(false);
  });

  it('suffit d’une seule vidéo parmi plusieurs références', () => {
    expect(
      hasVideoInput({
        reference_image_urls: ['https://res.cloudinary.com/c/image/upload/v1/a.png'],
        reference_video_urls: ['https://res.cloudinary.com/c/video/upload/v1/b.mp4'],
      }),
    ).toBe(true);
  });
});
