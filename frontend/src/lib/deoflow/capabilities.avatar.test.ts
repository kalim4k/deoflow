import { describe, it, expect } from 'vitest';
import { AI_MODELS } from './catalog';
import {
  MODEL_CAPABILITIES,
  acceptsAvatar,
  capabilitiesFor,
  characterRefFor,
  mediaOfMime,
} from './capabilities';

/**
 * `characterRef` désigne un mode et un emplacement PAR LEUR NOM, dans un autre
 * objet du même fichier. Rien dans le typage ne relie les deux : renommer
 * `input_urls` ou supprimer le mode `references` compilerait sans broncher, et
 * les avatars cesseraient simplement de fonctionner — silencieusement, pour le
 * modèle concerné seulement.
 *
 * Ces vérifications sont donc le seul lien réel entre la déclaration et sa
 * cible.
 */
describe('emplacement du visage d’avatar', () => {
  const slugs = Object.keys(MODEL_CAPABILITIES);

  it.each(slugs)('%s : le mode et l’emplacement déclarés existent', (slug) => {
    const declared = capabilitiesFor(slug)?.characterRef;
    if (!declared) return; // un modèle a le droit de ne pas accepter d'avatar

    const resolved = characterRefFor(slug);
    expect(
      resolved,
      `characterRef de ${slug} désigne ${declared.mode}/${declared.slot}, introuvable`,
    ).not.toBeNull();
    expect(resolved?.mode.id).toBe(declared.mode);
    expect(resolved?.slot.key).toBe(declared.slot);
  });

  it.each(slugs)('%s : l’emplacement accepte bien une image', (slug) => {
    const resolved = characterRefFor(slug);
    if (!resolved) return;
    // Un visage est un JPEG ou un PNG. Pointer un emplacement vidéo ferait
    // échouer chaque génération APRÈS débit.
    const accepted = resolved.slot.accept.map(mediaOfMime);
    expect(accepted).toContain('image');
  });

  it('seul Kling Motion Control refuse les avatars', () => {
    // Liste FIGÉE, pas « aucun » : qu'un modèle accepte ou refuse un avatar est
    // une décision produit, et elle doit être écrite quelque part. Un modèle
    // ajouté au catalogue sans `characterRef` fait échouer ce test — c'est le
    // but, il force à trancher au lieu de laisser l'oubli décider.
    //
    // Kling : l'emplacement « Personnage » attend l'image de DÉPART du clip.
    // Un visage sur fond blanc y donnerait huit secondes de portrait.
    const refused = AI_MODELS.filter((m) => !acceptsAvatar(m.slug)).map((m) => m.slug);
    expect(refused).toEqual(['kling-2-6']);
  });

  it('aucun avatar ne part en mode Texte', () => {
    // Un mode sans emplacement ne peut recevoir aucune image : le créateur
    // paierait une génération sans son personnage, sans rien voir venir.
    for (const slug of slugs) {
      const resolved = characterRefFor(slug);
      if (!resolved) continue;
      expect(resolved.mode.slots.length, `${slug} : mode sans emplacement`).toBeGreaterThan(0);
    }
  });

  it('l’emplacement laisse la place au visage', () => {
    for (const slug of slugs) {
      const resolved = characterRefFor(slug);
      if (!resolved) continue;
      expect(resolved.slot.maxCount, `${slug} : emplacement plein`).toBeGreaterThanOrEqual(1);
    }
  });
});
