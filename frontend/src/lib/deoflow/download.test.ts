import { describe, it, expect } from 'vitest';
import { downloadUrl, generationFilename } from './download';

const IMAGE = 'https://res.cloudinary.com/s5k7zx1m/image/upload/v1786586072/gen/u1/abc.png';
const VIDEO = 'https://res.cloudinary.com/s5k7zx1m/video/upload/v1786586072/gen/u1/abc.mp4';

describe('téléchargement forcé', () => {
  it('insère le drapeau de pièce jointe juste après le segment de livraison', () => {
    // C'est cet en-tête, imposé par le CDN, qui fait enregistrer le fichier :
    // l'attribut HTML `download` est ignoré hors de notre domaine.
    expect(downloadUrl(IMAGE, 'ma création')).toBe(
      'https://res.cloudinary.com/s5k7zx1m/image/upload/fl_attachment:ma-creation/v1786586072/gen/u1/abc.png',
    );
  });

  it('traite la vidéo comme l’image', () => {
    expect(downloadUrl(VIDEO, 'clip')).toContain('/video/upload/fl_attachment:clip/');
  });

  it('conserve le chemin et le nom du fichier d’origine', () => {
    // Une insertion mal placée casserait la signature de l'URL : le CDN
    // renverrait 404, et le bouton ne téléchargerait rien du tout.
    expect(downloadUrl(IMAGE, 'x')).toContain('/v1786586072/gen/u1/abc.png');
  });

  it('gère la livraison authentifiée', () => {
    const url = 'https://res.cloudinary.com/c/image/authenticated/v1/gen/a.png';
    expect(downloadUrl(url, 'x')).toContain('/image/authenticated/fl_attachment:x/');
  });
});

describe('URLs qui ne sont pas du CDN', () => {
  it('laisse intacte une URL de fournisseur', () => {
    // Une création peut encore porter une URL temporaire de kie.ai si la
    // recopie a échoué. Mieux vaut l'ouvrir que casser le lien.
    const kie = 'https://tempfile.aiquickdraw.com/s/abc.png';
    expect(downloadUrl(kie, 'x')).toBe(kie);
  });

  it('laisse intacte une image de démonstration en data URI', () => {
    const data = 'data:image/svg+xml;base64,AAAA';
    expect(downloadUrl(data, 'x')).toBe(data);
  });

  it('refuse de réécrire une URL non chiffrée', () => {
    const http = 'http://res.cloudinary.com/c/image/upload/v1/a.png';
    expect(downloadUrl(http, 'x')).toBe(http);
  });
});

describe('nom de fichier', () => {
  it('retire accents, espaces et ponctuation', () => {
    // Les noms partent d'un prompt français ; un « / » ou un « : » dans un nom
    // de fichier est refusé par Windows.
    expect(downloadUrl(IMAGE, 'Été : plage / soleil !')).toContain(
      'fl_attachment:ete-plage-soleil/',
    );
  });

  it('retombe sur un nom par défaut quand il ne reste rien', () => {
    expect(downloadUrl(IMAGE, '!!! ???')).toContain('fl_attachment:creation/');
  });

  it('borne la longueur', () => {
    const long = 'a'.repeat(500);
    const flag = /fl_attachment:([^/]+)\//.exec(downloadUrl(IMAGE, long))?.[1] ?? '';
    expect(flag.length).toBeLessThanOrEqual(60);
  });

  it('nomme la création d’après son modèle et distingue deux fichiers', () => {
    expect(generationFilename('nano-banana-2', 'clx0000000000abcdef')).toBe(
      'deoflow-nano-banana-2-abcdef',
    );
    expect(generationFilename('nano-banana-2', 'clx0000000000abcdef', 1)).toBe(
      'deoflow-nano-banana-2-abcdef-2',
    );
  });
});
