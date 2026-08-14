import type { MetadataRoute } from 'next';

/**
 * Manifeste de l'application installable.
 *
 * Convention Next.js : ce fichier est servi à `/manifest.webmanifest` et Next
 * insère lui-même le `<link rel="manifest">` dans chaque page. Rien à écrire
 * dans le `<head>`.
 *
 * Chrome refuse de proposer l'installation — sans le dire — si l'un de ces
 * éléments manque : `name`, `short_name`, `start_url`, `display: standalone`,
 * une icône 192 et une icône 512. Le diagnostic se lit dans l'onglet
 * « Application » des outils de développement, nulle part ailleurs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Identité stable de l'application. Sans elle, changer `start_url` un jour
    // ferait apparaître une SECONDE application installée à côté de la première.
    id: '/',
    name: 'Deoflow',
    short_name: 'Deoflow',
    description: 'Créez vos images et vidéos IA et payez en Mobile Money. Sans carte bancaire.',
    lang: 'fr',
    dir: 'ltr',

    // Ouvre sur l'application, pas sur la page de vente : une fois installée,
    // l'icône doit se comporter comme une application. Les visiteurs non
    // connectés sont redirigés vers /login par l'AppShell.
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',

    // Écran de démarrage et barre d'état. On reprend `--color-canvas` de
    // globals.css : une couleur différente ferait clignoter un fond étranger
    // pendant le chargement.
    background_color: '#fafafa',
    theme_color: '#fafafa',

    categories: ['photo', 'video', 'productivity'],

    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Celle qui donne les bords arrondis sur l'écran d'accueil Android : le
      // lanceur y taille sa propre forme. Sans elle, Android pose l'icône
      // « any » dans un carré blanc avec une marge.
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
