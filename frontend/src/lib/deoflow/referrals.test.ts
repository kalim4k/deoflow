import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMMISSION_RATE_BPS,
  REFERRAL_ALPHABET,
  REFERRAL_CODE_LENGTH,
  commissionFor,
  isReferralCodeShaped,
  normalizeReferralCode,
  ratePercent,
  referralLink,
} from './referrals';

describe('barème', () => {
  it('vaut 30 %', () => {
    expect(COMMISSION_RATE_BPS).toBe(3_000);
    expect(ratePercent()).toBe(30);
  });

  it('calcule la commission sur les paliers réels du catalogue', () => {
    expect(commissionFor(3_000)).toBe(900); // Pack Starter
    expect(commissionFor(9_000)).toBe(2_700); // Pack Créateur
    expect(commissionFor(30_000)).toBe(9_000); // Pack Pro
  });

  it('réaffiche une ancienne commission à son taux d’époque', () => {
    // Le taux est stocké sur chaque ligne : une commission acquise à 25 % doit
    // pouvoir être recalculée telle quelle après le passage à 30 %. Sans ce
    // paramètre, l'historique se réécrirait à chaque changement de barème.
    expect(commissionFor(3_000, 2_500)).toBe(750);
    expect(commissionFor(30_000, 2_500)).toBe(7_500);
  });

  it('arrondit vers le bas, jamais vers le haut', () => {
    // 3 FCFA × 30 % = 0,9. Arrondir au supérieur créerait un franc à partir
    // de rien, à chaque achat, et le registre cesserait de boucler.
    expect(commissionFor(3)).toBe(0);
    expect(commissionFor(4)).toBe(1);
  });

  it('ne produit jamais de commission négative ou absurde', () => {
    expect(commissionFor(0)).toBe(0);
    expect(commissionFor(-5_000)).toBe(0);
    expect(commissionFor(Number.NaN)).toBe(0);
  });

  it('rend toujours un entier — le franc CFA n’a pas de centime', () => {
    for (const amount of [1, 7, 999, 3_000, 12_345]) {
      expect(Number.isInteger(commissionFor(amount))).toBe(true);
    }
  });
});

describe('code public', () => {
  it('exclut les caractères qui se confondent à l’écran', () => {
    // I/1, L/1, O/0 se confondent sur une capture d'écran partagée ; U est
    // écarté parce qu'il fabrique des mots malheureux.
    for (const banned of ['I', 'L', 'O', 'U']) {
      expect(REFERRAL_ALPHABET).not.toContain(banned);
    }
  });

  it('accepte un code bien formé', () => {
    expect(isReferralCodeShaped('A1B2C3D4')).toBe(true);
  });

  it('refuse tout le reste', () => {
    const rejected = [
      '', // vide
      'A1B2C3D', // trop court
      'A1B2C3D4E', // trop long
      'A1B2C3DI', // caractère exclu
      'a1b2c3d4', // minuscules — à normaliser d'abord
      'A1B2-3D4', // ponctuation
      'A'.repeat(4_000), // lien forgé
    ];
    for (const code of rejected) {
      expect(isReferralCodeShaped(code), code.slice(0, 20)).toBe(false);
    }
  });

  it('normalise avant de valider', () => {
    expect(isReferralCodeShaped(normalizeReferralCode('  a1b2c3d4 '))).toBe(true);
  });

  it('a la longueur annoncée', () => {
    expect(REFERRAL_CODE_LENGTH).toBe(8);
  });
});

describe('lien partagé', () => {
  it('pointe sur l’accueil, pas sur l’inscription', () => {
    // Un visiteur qui arrive par le partage d'un créateur doit d'abord
    // comprendre ce qu'est le produit.
    expect(referralLink('https://deoflow.com', 'A1B2C3D4')).toBe(
      'https://deoflow.com/?ref=A1B2C3D4',
    );
  });

  it('ne double pas la barre oblique', () => {
    expect(referralLink('https://deoflow.com/', 'A1B2C3D4')).toBe(
      'https://deoflow.com/?ref=A1B2C3D4',
    );
  });
});

/**
 * L'exigence produit la plus explicite du programme : celui qui s'inscrit avec
 * un lien ne doit RIEN voir. Pas de champ « code de parrainage », pas même un
 * champ pré-rempli et masqué. Le code voyage en cookie httpOnly et c'est le
 * serveur qui le lit.
 *
 * Ces vérifications portent sur le texte des fichiers : c'est grossier, mais
 * c'est ce qui empêche quelqu'un de « rendre service » en ajoutant le champ.
 */
describe('le filleul ne voit jamais de code', () => {
  function read(...parts: string[]): string {
    return readFileSync(join(process.cwd(), ...parts), 'utf8');
  }

  const signup = read('src', 'app', 'signup', 'page.tsx');

  it('le formulaire d’inscription n’a aucun champ de parrainage', () => {
    const code = signup.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    for (const forbidden of ['ref', 'referral', 'parrain', 'code de parrainage']) {
      expect(code.toLowerCase(), `champ « ${forbidden} » réapparu`).not.toMatch(
        new RegExp(`(label|placeholder|name)=["'][^"']*${forbidden}`, 'i'),
      );
    }
  });

  it('l’inscription n’envoie jamais de code au serveur', () => {
    // Le corps de la requête ne porte que l'email et le mot de passe. Un code
    // transmis par le navigateur serait falsifiable.
    expect(signup).toContain('body: { email, password }');
  });

  it('la route d’inscription lit le cookie, pas le corps de la requête', () => {
    const route = read('src', 'app', 'api', 'auth', 'signup', 'route.ts');
    expect(route).toContain('attachPendingReferral');
  });

  it('le cookie est httpOnly — hors de portée du JavaScript de la page', () => {
    const middleware = read('src', 'middleware.ts');
    expect(middleware).toContain('httpOnly: true');
    // `lax` et non `strict` : le filleul arrive depuis TikTok ou WhatsApp.
    expect(middleware).toContain("sameSite: 'lax'");
  });

  it('le middleware retire le code de l’URL', () => {
    // Sans ça, le nouveau venu se promènerait avec le code de son parrain
    // collé derrière chaque adresse qu'il partage à son tour.
    const middleware = read('src', 'middleware.ts');
    expect(middleware).toContain('searchParams.delete(REFERRAL_PARAM)');
  });

  it('le middleware valide la forme avant d’écrire quoi que ce soit', () => {
    const middleware = read('src', 'middleware.ts');
    expect(middleware).toContain('isReferralCodeShaped');
  });
});

/**
 * Le middleware a vécu à la racine de `frontend/`, où Next.js ne le charge PAS
 * quand le projet a un dossier `src/`. Il n'y a jamais tourné, et rien ne l'a
 * signalé : il était configuré pour être inerte par défaut. La capture du lien
 * de parrainage, elle, n'a pas ce luxe — sans middleware, aucun filleul n'est
 * jamais rattaché et le programme entier ne paie rien.
 */
describe('emplacement du middleware', () => {
  it('vit dans src/, à côté de app/', () => {
    const root = process.cwd();
    expect(existsSync(join(root, 'src', 'middleware.ts')), 'src/middleware.ts absent').toBe(true);
    expect(existsSync(join(root, 'middleware.ts')), 'une copie subsiste à la racine').toBe(false);
    // La règle est celle de Next : middleware et app/ sont voisins.
    expect(existsSync(join(root, 'src', 'app'))).toBe(true);
  });
});
