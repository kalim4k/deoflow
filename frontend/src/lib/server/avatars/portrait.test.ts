import { describe, it, expect } from 'vitest';
import { AVATAR_MODELS, PORTRAIT_RATIO, buildPortraitPrompt, isAvatarModel } from './portrait';
import { capabilitiesFor } from '@/lib/deoflow/capabilities';

/**
 * Le gabarit décide de la réutilisabilité de TOUS les avatars.
 *
 * Un visage qui revient en pied, ou avec un décor, traîne ce décor dans chaque
 * scène générée ensuite — et le créateur ne comprend pas pourquoi ses images se
 * passent toutes au même endroit.
 *
 * ⚠️ Ces tests vérifient que les clauses SONT LÀ, pas qu'elles gagnent. Un
 * prompt n'a aucun pouvoir de contrainte sur un modèle génératif ; prétendre le
 * contraire ici donnerait une fausse assurance.
 */
describe('gabarit de portrait', () => {
  const CLAUSES = [/tête et épaules/i, /fond blanc uni/i, /de face/i, /une seule personne/i];

  it.each([
    ['description ordinaire', 'Jeune femme togolaise, 24 ans, tresses'],
    ['description vide', ''],
    ['description qui contredit le cadrage', 'en pied, sur une plage au coucher du soleil'],
    ['description très longue', 'a'.repeat(3_000)],
  ])('%s : les clauses restent présentes', (_label, description) => {
    const prompt = buildPortraitPrompt(description);
    for (const clause of CLAUSES) expect(prompt).toMatch(clause);
  });

  it('conserve la description du créateur', () => {
    expect(buildPortraitPrompt('tresses longues et boucles dorées')).toContain(
      'tresses longues et boucles dorées',
    );
  });

  it('place les contraintes APRÈS la description', () => {
    // Ce qui vient en dernier cadre ce qui précède : la description dit QUI,
    // les clauses disent comment l'image doit être faite.
    const prompt = buildPortraitPrompt('une femme de 24 ans');
    expect(prompt.indexOf('une femme de 24 ans')).toBeLessThan(prompt.indexOf('fond blanc uni'));
  });

  it('demande de PRÉSERVER les traits quand une photo est fournie', () => {
    // Sans cette bascule, le modèle produit un visage ressemblant « en
    // général » mais pas à la photo — et le créateur croit à un bug.
    const fromPhoto = buildPortraitPrompt('style afro-urbain', true);
    expect(fromPhoto).toMatch(/image de référence/i);
    expect(fromPhoto).toMatch(/mêmes traits/i);

    expect(buildPortraitPrompt('style afro-urbain', false)).toMatch(/personne fictive/i);
  });

  it('ne laisse pas de ponctuation orpheline sur une description vide', () => {
    expect(buildPortraitPrompt('')).not.toMatch(/\.\s*\./);
    expect(buildPortraitPrompt('  ')).not.toMatch(/\.\s*\./);
  });
});

describe('modèles autorisés', () => {
  it.each(AVATAR_MODELS)('%s existe au catalogue et sait produire une image', (slug) => {
    const caps = capabilitiesFor(slug);
    expect(caps, `${slug} absent de MODEL_CAPABILITIES`).toBeDefined();
    // Le portrait part d'un simple prompt : il faut un mode texte.
    expect(caps?.modes.some((m) => m.slots.length === 0)).toBe(true);
  });

  it('le ratio imposé est accepté par les deux modèles', () => {
    // Envoyer un format que l'API refuse ferait échouer chaque création
    // d'avatar APRÈS débit.
    for (const slug of AVATAR_MODELS) {
      expect(capabilitiesFor(slug)?.apiRatios, slug).toContain(PORTRAIT_RATIO);
    }
  });

  it.each([
    ['nano-banana-2', true],
    ['gpt-image-2', true],
    ['veo-3-1', false],
    ['kling-2-6', false],
    ['', false],
  ])('isAvatarModel(%s) → %s', (slug, expected) => {
    expect(isAvatarModel(slug)).toBe(expected);
  });
});
