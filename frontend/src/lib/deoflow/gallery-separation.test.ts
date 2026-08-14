import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les visages d'avatars ne passent PAS par la galerie.
 *
 * Un visage sort du même moteur qu'une création, mais ce n'en est pas une :
 * la galerie du créateur est sa production publiable, pas son matériel de
 * travail.
 *
 * La séparation tient sur deux moitiés, et l'une sans l'autre ne protège rien :
 *   - la génération d'un visage est MARQUÉE `purpose: 'AVATAR'` à sa création ;
 *   - la route de la galerie FILTRE sur `purpose: 'CREATION'`.
 *
 * Le filtre vit dans la route et non dans les écrans : toute surface future qui
 * listera des générations héritera du bon comportement sans y penser. L'inverse
 * garantit qu'un écran ajouté dans six mois affichera les visages au milieu des
 * créations — et le pire est que ça ne cassera rien de visible.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');
}

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

describe('séparation galerie / personnages', () => {
  it('la route de la galerie filtre sur CREATION', () => {
    const route = codeOnly(read('app', 'api', 'generations', 'route.ts'));
    expect(route.replace(/\s+/g, ' ')).toContain("purpose: 'CREATION'");
  });

  it('le service d’avatars marque bien ses générations', () => {
    const service = codeOnly(read('lib', 'server', 'avatars', 'service.ts'));
    // Deux occurrences attendues : création initiale et régénération du visage.
    const marks = service.match(/purpose:\s*'AVATAR'/g) ?? [];
    expect(marks.length, 'une régénération non marquée réapparaîtrait en galerie').toBe(2);
  });

  it('`purpose` n’est pas exposé au corps de la requête publique', () => {
    // La route de génération accepte un corps validé par Zod. Si `purpose` y
    // entrait, n'importe qui pourrait masquer ses propres générations — ou
    // pire, les faire passer pour des avatars.
    const schema = read('app', 'api', 'generations', 'route.ts');
    const zodBlock = schema.slice(schema.indexOf('bodySchema'), schema.indexOf('export async'));
    expect(zodBlock).not.toContain('purpose');
  });

  it('les écrans ne refiltrent pas eux-mêmes', () => {
    // Si un écran filtrait de son côté, la protection deviendrait facultative
    // et le prochain écran l'oublierait.
    for (const page of [read('app', 'gallery', 'page.tsx'), read('app', 'dashboard', 'page.tsx')]) {
      expect(codeOnly(page)).not.toContain('AVATAR');
    }
  });

  it('le total consommé vient du serveur, pas des vignettes affichées', () => {
    // Le tableau de bord n'affiche que 5 générations : en additionner les
    // crédits donnait un « consommé » qui n'était le total de rien — et
    // écarter les avatars l'aurait rendu franchement faux.
    const dashboard = codeOnly(read('app', 'dashboard', 'page.tsx'));
    expect(dashboard).toMatch(/spent,/);
    expect(dashboard).not.toMatch(/reduce\(\(sum, g\)/);
  });
});
