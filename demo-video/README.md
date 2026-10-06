# Vidéo de démonstration — page d'accueil

Source [Remotion](https://www.remotion.dev) de la vidéo affichée sous le hero de la page d'accueil :
recharger en Mobile Money, créer un personnage, générer une vidéo avec lui. 53 s, 1080 × 1350 (4:5),
sans son.

Projet **autonome** (npm, hors workspace pnpm) : Remotion impose ses propres versions de React et de
zod, qu'il ne faut pas imposer au site.

## Refaire le rendu

```bash
cd demo-video
npm install
npm run render
```

Le script régénère les prix depuis le catalogue (`pnpm --filter frontend run demo:facts`), rend le MP4
et l'affiche, les copie dans `frontend/public/demo/`, puis réécrit `frontend/src/lib/deoflow/demoVideo.ts`
(chemins + début des chapitres). **Refaire le rendu après tout changement de prix ou de pack** : sinon
la vidéo affiche un tarif que le site ne pratique plus.

- `npm run studio` — aperçu interactif dans le navigateur.
- `npm run stills -- 111 476 936` — quelques images fixes dans `out/stills/`, pour vérifier un cadrage.

## Ce qui est réel

Le visage d'Awa (`public/awa.jpg`) et le clip (`public/awa-lome.mp4`) sont de vrais rendus Nano Banana 2
et Veo 3.1, produits par le code de l'application avec le texte exact tapé à l'écran.
`public/provenance.json` garde les prompts et les identifiants de tâche kie.ai.

Pour les refaire (≈ 38 crédits kie.ai) : `pnpm --filter frontend run demo:assets`.

L'interface filmée est redessinée à partir des composants du site — mêmes classes, mêmes textes. Si le
site change d'apparence, reporter les jetons dans `src/theme.ts` et les textes dans `src/screens/`.
