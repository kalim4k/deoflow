import { describe, it, expect } from 'vitest';
import { AI_MODELS } from './catalog';
import {
  MODEL_CAPABILITIES,
  alwaysRequires,
  capabilitiesFor,
  defaultParams,
  durationDrivingSlots,
  durationLabel,
  effectiveSlots,
  inputSummary,
  minBillableSeconds,
  modeFor,
  paramsFor,
} from './capabilities';

describe('couverture du catalogue', () => {
  it('décrit les entrées de chaque modèle vendu', () => {
    // Sans capacités, l'atelier ne sait pas quels champs afficher : il
    // proposerait un formulaire vide sur un modèle facturé.
    for (const model of AI_MODELS) {
      expect(capabilitiesFor(model.slug), `capacités manquantes : ${model.slug}`).toBeDefined();
    }
  });

  it('n’annonce que des formats acceptés par l’API', () => {
    for (const model of AI_MODELS) {
      const caps = capabilitiesFor(model.slug)!;
      for (const ratio of model.ratios) {
        expect(caps.apiRatios, `${model.slug} : format ${ratio} refusé par l’API`).toContain(ratio);
      }
    }
  });

  it('donne une durée à chaque modèle vidéo et aucune aux modèles image', () => {
    for (const model of AI_MODELS) {
      const kindOfDuration = capabilitiesFor(model.slug)!.duration.kind;
      if (model.kind === 'video') {
        expect(kindOfDuration, `${model.slug}`).not.toBe('none');
      } else {
        expect(kindOfDuration, `${model.slug}`).toBe('none');
      }
    }
  });
});

describe('emplacements de fichiers', () => {
  it('donne au moins un mode à chaque modèle', () => {
    for (const [slug, caps] of Object.entries(MODEL_CAPABILITIES)) {
      expect(caps.modes.length, `${slug} : aucun mode`).toBeGreaterThan(0);
    }
  });

  it('déclare pour chaque emplacement de quoi construire la requête et la valider', () => {
    // `key` et `wire` partent jusqu'au constructeur de requête ; sans type
    // accepté ni taille limite, la validation côté navigateur laisserait tout
    // passer et l'échec surviendrait chez le fournisseur, après débit.
    for (const [slug, caps] of Object.entries(MODEL_CAPABILITIES)) {
      for (const mode of caps.modes) {
        for (const slot of mode.slots) {
          const where = `${slug}/${mode.id}/${slot.key}`;
          expect(slot.key.length, where).toBeGreaterThan(0);
          expect(['string', 'array'], where).toContain(slot.wire);
          expect(slot.maxCount, where).toBeGreaterThan(0);
          expect(slot.maxBytes, where).toBeGreaterThan(0);
          expect(slot.accept.length, where).toBeGreaterThan(0);
          expect(slot.label.length, where).toBeGreaterThan(0);
          // Un emplacement en `string` ne peut pas porter plusieurs fichiers.
          if (slot.wire === 'string') expect(slot.maxCount, where).toBe(1);
        }
      }
    }
  });

  it('n’emploie jamais deux fois la même clé dans un mode', () => {
    for (const [slug, caps] of Object.entries(MODEL_CAPABILITIES)) {
      for (const mode of caps.modes) {
        const keys = mode.slots.map((s) => s.key);
        expect(new Set(keys).size, `${slug}/${mode.id} : clé dupliquée`).toBe(keys.length);
      }
    }
  });

  it('laisse toujours une porte d’entrée sans fichier, sauf transfert de mouvement', () => {
    // Un modèle qui exige un média dans TOUS ses modes est un cas particulier
    // assumé (Kling). Si un autre le devenait par accident, le créateur se
    // retrouverait bloqué sur un écran sans savoir pourquoi.
    const blocked = AI_MODELS.filter(
      (m) => alwaysRequires(m.slug, 'image') || alwaysRequires(m.slug, 'video'),
    ).map((m) => m.slug);
    expect(blocked).toEqual(['kling-2-6']);
  });

  it('exige image ET vidéo pour le transfert de mouvement', () => {
    const slots = modeFor('kling-2-6')!.slots;
    expect(slots.map((s) => [s.media, s.requirement])).toEqual([
      ['image', 'required'],
      ['video', 'required'],
    ]);
  });

  it('expose les cinq entrées de Seedance, vidéos et sons compris', () => {
    const caps = capabilitiesFor('seedance-2-5')!;
    const keys = caps.modes.flatMap((m) => m.slots.map((s) => s.key));
    expect(keys).toEqual([
      'first_frame_url',
      'last_frame_url',
      'reference_image_urls',
      'reference_video_urls',
      'reference_audio_urls',
    ]);
    // Les trois vidéos comme les trois sons plafonnent à 30 s cumulées.
    const refs = modeFor('seedance-2-5', 'references')!.slots;
    expect(refs.find((s) => s.media === 'video')?.totalMaxSeconds).toBe(30);
    expect(refs.find((s) => s.media === 'audio')?.totalMaxSeconds).toBe(30);
    expect(modeFor('seedance-2-5', 'references')?.requiresAnySlot).toBe(true);
  });

  it('ouvre Gemini Omni aux quatre natures d’entrée annoncées', () => {
    // kie.ai ne déclare qu'un champ, `image_urls`, mais sa page produit
    // annonce texte, image, vidéo ET voix — et sa note sur `duration` parle
    // d'une entrée vidéo. On traite donc ce champ comme générique. À
    // reconfirmer au premier appel réel : si une vidéo est refusée, c'est
    // cette liste `accept` qu'il faut réduire.
    const slot = modeFor('gemini-omni-flash', 'image')!.slots[0]!;
    expect(slot.key).toBe('image_urls');
    expect(slot.accept).toEqual(expect.arrayContaining(['image/jpeg', 'video/mp4', 'audio/mpeg']));
    // Une vidéo en entrée fait décider la durée par le modèle : l'emplacement
    // doit donc porter la durée, sinon on facturerait le choix affiché.
    expect(slot.drivesDuration).toBe(true);
  });

  it('retombe sur le premier mode quand celui demandé n’existe pas', () => {
    expect(modeFor('veo-3-1', 'motion')?.id).toBe('text');
    expect(modeFor('veo-3-1', 'frames')?.id).toBe('frames');
    expect(modeFor('veo-3-1', 'references')?.id).toBe('references');
    expect(modeFor('modele-fantome')).toBeUndefined();
  });

  it('nomme le mode fournisseur sur chacun des modes de Veo', () => {
    // Veo devine le mode d'après la présence d'images quand on ne le lui dit
    // pas. Un mode ajouté sans `apiMode` produirait donc un rendu au hasard —
    // « début et fin » et « références » prennent tous deux deux images.
    for (const mode of MODEL_CAPABILITIES['veo-3-1']!.modes) {
      expect(mode.apiMode, `${mode.id} sans mode fournisseur`).toBeTruthy();
    }
  });
});

describe('paramètres et contraintes', () => {
  it('porte la vidéo de Kling de 10 s à 30 s selon l’orientation choisie', () => {
    // C'est tout l'enjeu : le mode « comme dans la vidéo » est ce qui rend les
    // 30 s accessibles. Le figer priverait le modèle des deux tiers de sa
    // capacité.
    const mode = modeFor('kling-2-6')!;
    const seconds = (orientation: string) =>
      effectiveSlots(mode, { character_orientation: orientation }).find(
        (s) => s.key === 'video_urls',
      )?.maxSeconds;

    expect(seconds('image')).toBe(10);
    expect(seconds('video')).toBe(30);
    // Valeur inconnue : on garde la contrainte déclarée sur l'emplacement.
    expect(seconds('n’importe quoi')).toBe(10);
  });

  it('part des valeurs par défaut déclarées', () => {
    const caps = capabilitiesFor('kling-2-6')!;
    expect(defaultParams(caps, modeFor('kling-2-6'))).toEqual({ character_orientation: 'image' });
    expect(defaultParams(capabilitiesFor('seedance-2-5')!, modeFor('seedance-2-5'))).toEqual({
      generate_audio: true,
    });
  });

  it('cumule les paramètres du modèle et ceux du mode', () => {
    const caps = capabilitiesFor('seedance-2-5')!;
    const keys = paramsFor(caps, modeFor('seedance-2-5', 'references')).map((p) => p.key);
    expect(keys).toContain('generate_audio');
  });
});

describe('durées', () => {
  it('facture au plancher réel de chaque modèle', () => {
    expect(minBillableSeconds('veo-3-1')).toBe(8); // longueur imposée
    expect(minBillableSeconds('gemini-omni-flash')).toBe(4); // plus court choix
    expect(minBillableSeconds('seedance-2-5')).toBe(1); // bas de la plage
    expect(minBillableSeconds('kling-2-6')).toBe(3); // vidéo de référence minimale
    expect(minBillableSeconds('nano-banana-2')).toBe(0); // pas une vidéo
  });

  it('nomme les emplacements dont le fichier fixe le prix', () => {
    // Toute vidéo déposée dans un de ces emplacements l'emporte sur le
    // réglage affiché. En oublier un ferait facturer une durée fictive.
    expect(durationDrivingSlots(modeFor('kling-2-6')).map((s) => s.key)).toEqual(['video_urls']);
    expect(durationDrivingSlots(modeFor('gemini-omni-flash', 'image')).map((s) => s.key)).toEqual([
      'image_urls',
    ]);
    expect(durationDrivingSlots(modeFor('seedance-2-5', 'references'))).toEqual([]);
  });

  it('décrit la durée sans inventer de chiffre', () => {
    expect(durationLabel('veo-3-1')).toBe('8 s (imposée par le modèle)');
    expect(durationLabel('seedance-2-5')).toBe('de 1 à 30 secondes');
    expect(durationLabel('kling-2-6')).toBe('celle de votre vidéo de référence');
    expect(durationLabel('nano-banana-2')).toBeNull();
  });
});

describe('résumé des entrées', () => {
  it('signale ce que chaque modèle réclame', () => {
    expect(inputSummary('kling-2-6', 'video')).toBe('Image + vidéo requises');
    expect(inputSummary('veo-3-1', 'video')).toBe('Texte ou image');
    expect(inputSummary('nano-banana-2', 'image')).toBe('Texte ou images');
    expect(inputSummary('seedance-2-5', 'video')).toBe('Texte, images, vidéos ou sons');
    expect(inputSummary('gemini-omni-flash', 'video')).toBe('Texte, images, vidéos ou sons');
  });

  it('ne se casse pas sur un modèle inconnu', () => {
    expect(inputSummary('modele-fantome', 'image')).toBe('Texte');
  });
});
