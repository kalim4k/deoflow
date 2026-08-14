import { describe, it, expect, afterEach } from 'vitest';
import { requiresEmailVerification } from './email-verification';

/**
 * Le sens du drapeau est inversé par rapport au starter, et l'inversion porte
 * sur de la sécurité : elle mérite un test qui échoue si quelqu'un la remet
 * dans l'autre sens sans le vouloir.
 *
 * Deoflow n'exige PAS la vérification par défaut. Aucun envoi d'email n'est
 * configuré en production, donc l'ancien défaut faisait attendre un code qui
 * ne partait jamais : personne ne pouvait créer de compte, et rien ne le
 * signalait. La contrepartie — énumération possible, adresse non prouvée — est
 * documentée dans le module et dans CLAUDE.md.
 */
const KEY = 'AUTH_REQUIRE_EMAIL_VERIFICATION';

afterEach(() => {
  delete process.env[KEY];
});

describe('vérification d’email', () => {
  it('n’est PAS exigée quand la variable est absente', () => {
    delete process.env[KEY];
    expect(requiresEmailVerification()).toBe(false);
  });

  it('n’est exigée que sur la valeur exacte "1"', () => {
    process.env[KEY] = '1';
    expect(requiresEmailVerification()).toBe(true);
  });

  it('reste désactivée sur toute autre valeur', () => {
    // `true`, `yes`, `oui` : autant de façons de croire qu'on l'a activée. Une
    // seule valeur compte, et le module ne prétend pas deviner les autres.
    for (const v of ['0', '', 'true', 'yes', 'oui', 'on']) {
      process.env[KEY] = v;
      expect(requiresEmailVerification(), `valeur « ${v} »`).toBe(false);
    }
  });

  it('relit la variable à chaque appel', () => {
    // Lue au chargement du module, elle figerait la configuration jusqu'au
    // prochain déploiement — et rétablir la vérification demanderait une
    // reconstruction au lieu d'un simple redémarrage.
    delete process.env[KEY];
    expect(requiresEmailVerification()).toBe(false);
    process.env[KEY] = '1';
    expect(requiresEmailVerification()).toBe(true);
  });
});
