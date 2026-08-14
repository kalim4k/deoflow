# Polices hébergées localement

`space-grotesk-latin.woff2` — Space Grotesk, sous-ensemble latin, police **variable**
(axe `wght` 300–700). 22 Ko. Chargée par [../layout.tsx](../layout.tsx) via `next/font/local`.

## Pourquoi ce fichier est dans le dépôt

`next/font/google` télécharge le `.woff2` depuis `fonts.gstatic.com` **au moment du build**.
Le 2026-08-14, ces URL ont renvoyé 404 et le déploiement Vercel a échoué :

```
Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
Received response with status 404 when requesting https://fonts.gstatic.com/...
```

Aucune ligne de notre code n'avait changé — seul le cache de build avait été vidé, forçant un
nouveau téléchargement. Un build qui dépend d'un CDN tiers joignable à la seconde près n'est pas
reproductible.

Bénéfice secondaire, celui qui compte pour Deoflow : la police est servie depuis notre domaine.
Un utilisateur en 4G instable n'a plus de résolution DNS ni de poignée de main TLS supplémentaires
vers `gstatic.com` avant de voir du texte.

## Le sous-ensemble latin suffit pour le français

La plage `U+0000–00FF` couvre é è ê ç à ù ô î û, et `U+0152–0153` couvre œ. Rien à ajouter.

## Rafraîchir le fichier

À ne faire que si Google publie une révision de la fonte (aujourd'hui `v22`).

```bash
curl -sS -o space-grotesk-latin.woff2 \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "$(curl -sS -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' \
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap' \
    | grep -A1 '/\* latin \*/' -m1 | grep -o 'https://[^)]*\.woff2' | head -1)"
```

L'en-tête `User-Agent` n'est pas décoratif : Google sert des URL différentes selon le client, et
celles destinées aux outils de build sont précisément celles qui ont renvoyé 404.

Vérifiez ensuite que le fichier commence bien par `wOF2` et pèse ~22 Ko, puis lancez `pnpm build`.
