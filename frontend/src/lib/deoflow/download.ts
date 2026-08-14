/**
 * Transforme une URL de création en URL qui déclenche un vrai téléchargement.
 *
 * Le problème : l'attribut HTML `download` d'un `<a>` est **ignoré dès que
 * l'URL pointe vers une autre origine** — c'est une protection du navigateur,
 * pas un bug. Nos créations sont servies par Cloudinary, donc par un autre
 * domaine : le navigateur ignorait l'attribut et affichait l'image au lieu de
 * l'enregistrer. Sur téléphone, l'utilisateur se retrouvait dans une visionneuse
 * sans savoir comment garder son fichier.
 *
 * La solution ne peut pas venir du HTML : seul le serveur qui sert le fichier
 * peut imposer un téléchargement, via l'en-tête `Content-Disposition`.
 * Cloudinary l'expose par le drapeau de livraison `fl_attachment`, inséré dans
 * le chemin de l'URL. Le fichier reste servi par le CDN — pas de détour par
 * notre serveur, donc pas d'octets qui transitent par une fonction Vercel
 * plafonnée à 4,5 Mo.
 *
 * L'alternative — `fetch` + `URL.createObjectURL` — chargerait la vidéo
 * entière dans la mémoire de l'onglet avant de l'écrire. Sur un téléphone
 * d'entrée de gamme avec un clip de 30 s, c'est l'onglet qui tombe.
 */

/** Caractères sûrs dans un nom de fichier, toutes plateformes confondues. */
function slugifyFilename(raw: string): string {
  const cleaned = raw
    .normalize('NFD') // sépare « é » en « e » + accent, pour retirer le second
    .replace(/[̀-ͯ]/g, '') // accents : « créa » → « crea »
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || 'creation';
}

/**
 * Renvoie l'URL à mettre dans le `href` du bouton de téléchargement.
 *
 * Sur une URL Cloudinary, insère `fl_attachment:<nom>` juste après le segment
 * de livraison. Sur toute autre URL (une URL temporaire du fournisseur, une
 * image de démonstration en data URI), renvoie l'entrée telle quelle : mieux
 * vaut un affichage qu'un lien cassé.
 *
 * L'extension n'est pas à fournir — Cloudinary ajoute celle du fichier stocké.
 */
export function downloadUrl(url: string, filename: string): string {
  if (!url.startsWith('https://')) return url;

  // `/image/upload/`, `/video/upload/`, `/raw/upload/` — et leurs variantes
  // `/authenticated/` selon le mode de livraison du compte.
  const match = /\/(image|video|raw)\/(upload|authenticated)\//.exec(url);
  if (!match) return url;

  const insertAt = match.index + match[0].length;
  return `${url.slice(0, insertAt)}fl_attachment:${slugifyFilename(filename)}/${url.slice(insertAt)}`;
}

/**
 * Nom de fichier lisible pour une création : le modèle qui l'a produite, puis
 * un fragment d'identifiant pour distinguer deux créations du même modèle dans
 * le dossier de téléchargements.
 */
export function generationFilename(modelSlug: string, id: string, index = 0): string {
  const suffix = index > 0 ? `-${index + 1}` : '';
  return `deoflow-${modelSlug}-${id.slice(-6)}${suffix}`;
}
