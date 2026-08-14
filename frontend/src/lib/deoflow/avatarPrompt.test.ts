import { describe, it, expect } from 'vitest';
import { composePrompt, enrichesPrompt } from './avatarPrompt';

const AWA = {
  name: 'Awa',
  description: 'Jeune femme togolaise de 24 ans, mince, tresses longues, style afro-urbain',
};

describe('composition du prompt', () => {
  it('place le personnage AVANT la scène', () => {
    // Ces modèles pondèrent plus fortement le début du prompt. L'ordre inverse
    // donne des images où le décor est juste et le personnage approximatif —
    // exactement le contraire de ce qu'on cherche.
    const composed = composePrompt(AWA, 'assise dans un taxi à Lomé');
    expect(composed.indexOf('Jeune femme')).toBeLessThan(composed.indexOf('taxi'));
  });

  it('ferme la description sans doubler la ponctuation', () => {
    expect(composePrompt(AWA, 'sur un marché')).toBe(`${AWA.description}. sur un marché`);
    expect(composePrompt({ ...AWA, description: 'Une femme.' }, 'au bureau')).toBe(
      'Une femme. au bureau',
    );
    expect(composePrompt({ ...AWA, description: 'Une femme !' }, 'au bureau')).toBe(
      'Une femme ! au bureau',
    );
  });

  it('ne laisse aucun séparateur orphelin', () => {
    // Une description vide ou un prompt vide ne doit pas produire « . texte »
    // ni « texte. » : ce sont des caractères envoyés au fournisseur, payés.
    expect(composePrompt({ name: 'Awa', description: '   ' }, 'au marché')).toBe('au marché');
    expect(composePrompt(AWA, '  ')).toBe(AWA.description);
    expect(composePrompt(null, 'au marché')).toBe('au marché');
    expect(composePrompt(undefined, 'au marché')).toBe('au marché');
  });

  it('n’envoie pas le NOM de l’avatar', () => {
    // « Awa » n'apprend rien au modèle sur une apparence, et un prénom tire la
    // génération vers des stéréotypes que le créateur n'a pas demandés.
    expect(composePrompt(AWA, 'au marché')).not.toContain('Awa');
  });

  it('coupe les espaces de bord', () => {
    expect(composePrompt({ name: 'A', description: '  Une femme  ' }, '  au marché  ')).toBe(
      'Une femme. au marché',
    );
  });
});

describe('enrichesPrompt', () => {
  it.each([
    [AWA, true],
    [{ name: 'Vide', description: '' }, false],
    [{ name: 'Blancs', description: '   ' }, false],
    [null, false],
    [undefined, false],
  ])('%#', (avatar, expected) => {
    expect(enrichesPrompt(avatar)).toBe(expected);
  });
});
