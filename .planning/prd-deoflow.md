# PRD — Deoflow

## 1. Vision produit

**Pitch en une phrase**
Deoflow est la plateforme web où les créateurs TikTok d'Afrique francophone génèrent des influenceuses IA réalistes et des vidéos virales avec les meilleurs modèles du marché, payable en Tmoney et Flooz — sans carte bancaire.

**Problème résolu**
Les créateurs TikTok africains qui veulent monétiser des influenceuses IA se heurtent à deux murs simultanés :
1. Ils doivent jongler entre 4-5 outils différents (Midjourney pour les images, Runway pour la vidéo, un éditeur pour assembler…), chacun avec sa propre interface et sa courbe d'apprentissage.
2. Même quand ils trouvent le bon outil, ils ne peuvent pas payer : 95% des SaaS de génération IA exigent une carte Visa/Mastercard que la majorité de la cible ne possède pas. Résultat : ils abandonnent ou restent bloqués sur des outils gratuits de mauvaise qualité qui ne produisent pas de contenu assez réaliste pour percer sur TikTok.

**Pourquoi maintenant**
- L'industrie des influenceurs IA est valorisée à 13,4 milliards de dollars et les créateurs francophones africains sont en pleine explosion (tutos TikTok en français atteignant 23K+ likes).
- Les API de génération (FAL.AI = 50% de parts de marché images, 44% vidéo) sont devenues assez matures et abordables pour être revendues avec marge en FCFA.
- TikTok Shop, Creator Fund, gifts en live et affiliés créent de vrais canaux de monétisation pour les influenceurs IA — la demande de contenu de qualité est urgente.
- Aucun concurrent ne cible l'Afrique francophone avec mobile money pour ce use case spécifique. La fenêtre est ouverte.

**Ce que le produit règle concrètement**

- **"Je galère à jongler entre 5 outils"** → Deoflow regroupe les meilleurs modèles de génération d'images et de vidéos dans une seule interface. Un seul compte, un seul solde de crédits, un seul endroit pour retrouver ses créations.
- **"Je ne peux pas payer sans carte bancaire"** → Achat de crédits via Tmoney et Flooz en quelques clics. Pas de carte Visa requise, pas d'abonnement imposé, le créateur recharge quand il veut avec ce qu'il a.
- **"Mes générations sont de mauvaise qualité, ça ne passe pas sur TikTok"** → Accès direct aux modèles les plus performants du marché (Flux 1.1 Ultra, Kling 3.0, Veo 3.1, Seedance, etc.) sans compromis sur la qualité.
- **"Je perds mes créations et je ne sais plus ce que j'ai généré"** → Galerie personnelle avec historique complet, téléchargement en un clic, prompts sauvegardés pour reproduire ce qui marche.
- **"Je ne sais pas combien ça me coûte"** → Coût en crédits affiché clairement avant chaque génération, solde visible en permanence, historique détaillé de chaque consommation.

---

## 2. Personas cibles

### Persona 1 — Kofi, 24 ans, créateur TikTok, Lomé (Togo)

- **Situation** : Kofi a lancé un compte TikTok d'influenceuse IA il y a 3 mois. Il poste 4-5 vidéos par semaine et commence à monétiser via les gifts en live. Il fait partie de la communauté de coaching de Kalim.
- **Pain points** :
  - Utilise 3 outils gratuits différents pour ses images et vidéos, dont la qualité est médiocre — ses vidéos peinent à dépasser 5K vues.
  - A essayé Midjourney mais a été bloqué au paiement (pas de carte Visa). A abandonné.
  - Perd du temps à télécharger, re-uploader et retrouver ses fichiers entre les outils.
- **Outils actuels** : Combinaison de Canva gratuit, outils IA gratuits avec watermark, et parfois des versions crackées partagées dans des groupes Telegram.
- **Pouvoir d'achat** : Peut investir 10 000-20 000 FCFA/mois dans ses outils si le retour est visible (il gagne ~50 000 FCFA/mois en gifts TikTok).

### Persona 2 — Aminata, 28 ans, aspirante créatrice, Abidjan (Côte d'Ivoire)

- **Situation** : Aminata a vu des vidéos d'influenceuses IA sur TikTok et veut se lancer mais ne sait pas par où commencer. Elle a rejoint le coaching de Kalim mais bloque sur la partie technique.
- **Pain points** :
  - Ne comprend pas quel modèle IA utiliser pour quel résultat — les noms de modèles ne lui disent rien.
  - A peur de "gaspiller" de l'argent sur un outil qui ne donne pas de bons résultats.
  - Ne veut pas s'engager dans un abonnement mensuel : elle veut tester d'abord avec un petit montant.
- **Outils actuels** : Aucun outil IA. Utilise uniquement CapCut pour le montage de vidéos classiques.
- **Pouvoir d'achat** : 5 000-10 000 FCFA pour démarrer, prête à augmenter si elle voit des résultats concrets sur son compte TikTok.

### Persona 3 — Kalim (admin/fondateur)

- **Situation** : Créateur TikTok et coach spécialisé dans les influenceuses IA. Gère la plateforme, surveille les revenus, ajoute/retire des modèles IA selon l'évolution du marché.
- **Pain points** :
  - Doit pouvoir ajuster les modèles disponibles rapidement (le marché IA change tous les 3 mois).
  - A besoin de visibilité sur les revenus, les transactions et l'utilisation pour piloter le business.
  - Veut identifier les utilisateurs les plus actifs pour les convertir en ambassadeurs ou les orienter vers son coaching.
- **Outils actuels** : Coaching via appels de groupe, gestion manuelle sur tableur/WhatsApp.

---

## 3. Pages & écrans

### Parcours d'inscription / authentification

**3.1 — Page d'accueil (landing)**
- Présenter la proposition de valeur de Deoflow et inciter à s'inscrire.
- Accédée par tout visiteur non connecté.
- Actions clés : voir les modèles disponibles et des exemples de résultats, cliquer sur « Créer un compte », cliquer sur « Se connecter ».

**3.2 — Page d'inscription**
- Créer un compte pour accéder à la plateforme.
- Accédée par les visiteurs non inscrits.
- Actions clés : s'inscrire par email ou via Google, accepter les conditions d'utilisation.

**3.3 — Page de connexion**
- Se connecter à son compte existant.
- Accédée par les utilisateurs déjà inscrits.
- Actions clés : se connecter par email/mot de passe ou Google, réinitialiser son mot de passe.

### Parcours principal (créateur)

**3.4 — Tableau de bord (Dashboard utilisateur)**
- Vue d'ensemble de son activité : solde de crédits, dernières générations, accès rapide à la création.
- Accédée par tout utilisateur connecté, c'est la page d'atterrissage après connexion.
- Actions clés : voir son solde de crédits, accéder rapidement au catalogue de modèles, voir ses 5 dernières générations.

**3.5 — Catalogue de modèles**
- Parcourir tous les modèles IA disponibles (images et vidéos), comprendre ce que chacun fait et combien il coûte.
- Accédée par tout utilisateur connecté avant de lancer une génération.
- Actions clés : filtrer par type (image/vidéo), voir le coût en crédits de chaque modèle, voir des exemples de résultats pour chaque modèle, sélectionner un modèle pour lancer une génération.

**3.6 — Page de génération d'images**
- Écrire un prompt, choisir un modèle image, et générer une ou plusieurs images.
- Accédée par tout utilisateur connecté ayant sélectionné un modèle image ou accédant directement.
- Actions clés : écrire/modifier son prompt, choisir le modèle (avec le coût affiché), lancer la génération et voir le résultat, télécharger l'image ou relancer avec un prompt modifié.

**3.7 — Page de génération de vidéos**
- Écrire un prompt, choisir un modèle vidéo, sélectionner la durée, et générer un clip.
- Accédée par tout utilisateur connecté ayant sélectionné un modèle vidéo ou accédant directement.
- Actions clés : écrire/modifier son prompt, choisir le modèle et la durée (avec le coût affiché), lancer la génération et prévisualiser le clip, télécharger la vidéo ou relancer.

**3.8 — Galerie personnelle**
- Retrouver toutes ses générations passées (images et vidéos), les télécharger à nouveau, les supprimer.
- Accédée par tout utilisateur connecté depuis le menu principal.
- Actions clés : parcourir ses générations par date ou type (image/vidéo), télécharger en un clic, voir le prompt utilisé pour chaque génération (pour reproduire un bon résultat).

**3.9 — Page Wallet / Crédits**
- Voir son solde actuel, son historique de consommation détaillé (quelle génération a coûté combien), et accéder à l'achat de crédits.
- Accédée par tout utilisateur connecté depuis le menu ou en cliquant sur son solde.
- Actions clés : consulter le solde et l'historique, lancer un achat de crédits.

**3.10 — Page d'achat de crédits**
- Choisir un pack de crédits et payer via Tmoney ou Flooz.
- Accédée depuis la page Wallet ou quand le solde est insuffisant pour une génération.
- Actions clés : sélectionner un pack (Starter, Créateur, Pro), choisir son moyen de paiement (Tmoney ou Flooz), confirmer et finaliser le paiement.

**3.11 — Page Profil / Paramètres**
- Gérer ses informations personnelles et ses préférences de compte.
- Accédée par tout utilisateur connecté.
- Actions clés : modifier email / mot de passe, voir son historique d'achats, se déconnecter.

### Parcours admin (Kalim)

**3.12 — Dashboard admin**
- Vue d'ensemble du business : nombre d'utilisateurs, revenus, volume de générations, crédits en circulation.
- Accédée par l'administrateur uniquement.
- Actions clés : consulter les métriques clés (revenus du jour/semaine/mois, nombre de générations, nouveaux inscrits), identifier les utilisateurs les plus actifs.

**3.13 — Gestion des utilisateurs (admin)**
- Voir la liste de tous les utilisateurs, leur solde, leur activité, et pouvoir intervenir si nécessaire.
- Accédée par l'administrateur uniquement.
- Actions clés : rechercher un utilisateur, voir son solde et historique, créditer/débiter manuellement des crédits (support client), désactiver un compte.

**3.14 — Gestion des modèles IA (admin)**
- Ajouter, retirer ou modifier les modèles IA disponibles dans le catalogue et leur coût en crédits.
- Accédée par l'administrateur uniquement.
- Actions clés : ajouter un nouveau modèle (nom, description, type, coût en crédits, exemples), désactiver un modèle obsolète, modifier le coût en crédits d'un modèle.

**3.15 — Suivi des transactions (admin)**
- Voir l'historique de tous les achats de crédits (montants, moyens de paiement, statuts).
- Accédée par l'administrateur uniquement.
- Actions clés : filtrer par date/statut/moyen de paiement, identifier les paiements échoués, exporter les données.

---

## 4. Fonctionnalités MVP (V1)

### Authentification & compte

| # | Feature | Description | Priorité |
|---|---------|-------------|----------|
| F1 | Inscription email + Google | L'utilisateur crée un compte en 30 secondes avec son email ou son compte Google. Pas de friction inutile, pas de vérification SMS. | P0 |
| F2 | Connexion / Déconnexion | Connexion par email/mot de passe ou Google. Session persistante pour ne pas se reconnecter à chaque visite sur mobile. | P0 |
| F3 | Réinitialisation de mot de passe | L'utilisateur reçoit un lien par email pour réinitialiser son mot de passe en cas d'oubli. | P0 |
| F4 | Page profil | L'utilisateur modifie son email, son mot de passe et consulte son historique d'achats. | P1 |

### Catalogue de modèles

| # | Feature | Description | Priorité |
|---|---------|-------------|----------|
| F5 | Catalogue avec filtres | Liste de tous les modèles IA disponibles, filtrable par type (image / vidéo). Chaque modèle affiche : nom, description courte, coût en crédits, et 2-3 exemples de résultats. | P0 |
| F6 | Fiche modèle détaillée | En cliquant sur un modèle, l'utilisateur voit une description complète, plus d'exemples, les paramètres disponibles (résolution, durée pour la vidéo) et le coût détaillé. | P1 |
| F7 | Indicateur de qualité/vitesse | Badge visible sur chaque modèle indiquant s'il est « Rapide » ou « Haute qualité » pour aider les débutants à choisir. | P2 |

### Génération d'images

| # | Feature | Description | Priorité |
|---|---------|-------------|----------|
| F8 | Prompt texte pour images | L'utilisateur écrit un prompt en texte libre. Le champ accepte le français et l'anglais. | P0 |
| F9 | Sélection du modèle image | L'utilisateur choisit parmi les modèles image disponibles. Le coût en crédits est affiché à côté de chaque option. | P0 |
| F10 | Confirmation avant génération | Avant de lancer, un récapitulatif affiche le modèle choisi, le coût en crédits, et le solde restant après. Si le solde est insuffisant, un bouton redirige vers l'achat de crédits. | P0 |
| F11 | Affichage du résultat image | L'image générée s'affiche en plein écran avec les options : télécharger, relancer avec le même prompt, modifier le prompt et relancer. | P0 |
| F12 | Choix du format/résolution image | L'utilisateur sélectionne le ratio (1:1, 9:16 pour TikTok, 16:9) avant de générer. | P1 |

### Génération de vidéos

| # | Feature | Description | Priorité |
|---|---------|-------------|----------|
| F13 | Prompt texte pour vidéos | L'utilisateur écrit un prompt en texte libre pour décrire la vidéo souhaitée. | P0 |
| F14 | Sélection du modèle vidéo | L'utilisateur choisit parmi les modèles vidéo disponibles. Coût en crédits affiché selon le modèle et la durée. | P0 |
| F15 | Sélection de la durée | L'utilisateur choisit la durée du clip (ex: 3 sec, 5 sec, 10 sec). Le coût en crédits se met à jour dynamiquement. | P0 |
| F16 | Confirmation avant génération | Même logique que F10 : récapitulatif, coût, solde restant, redirection achat si insuffisant. | P0 |
| F17 | Prévisualisation et téléchargement vidéo | Le clip généré se joue dans un player intégré. L'utilisateur peut télécharger, relancer ou modifier son prompt. | P0 |
| F18 | Image de référence (image-to-video) | L'utilisateur peut uploader une image (ex : une influenceuse générée précédemment) comme point de départ pour générer une vidéo cohérente. | P1 |

### Wallet & crédits

| # | Feature | Description | Priorité |
|---|---------|-------------|----------|
| F19 | Affichage permanent du solde | Le solde de crédits est visible en permanence dans le header/navigation, sur toutes les pages. | P0 |
| F20 | Historique de consommation | Liste chronologique de chaque génération avec : type (image/vidéo), modèle utilisé, crédits consommés, date/heure. | P0 |
| F21 | Alerte solde bas | Quand le solde descend sous 5 crédits, une notification visuelle incite l'utilisateur à recharger. | P1 |

### Achat de crédits

| # | Feature | Description | Priorité |
|---|---------|-------------|----------|
| F22 | Affichage des packs | Les 3 packs sont présentés clairement : Pack Starter (50 crédits — 5 000 FCFA), Pack Créateur (120 crédits — 10 000 FCFA), Pack Pro (300 crédits — 20 000 FCFA). Le pack Pro affiche un badge « Meilleur rapport qualité/prix ». | P0 |
| F23 | Paiement Tmoney | Intégration du paiement par Tmoney. L'utilisateur entre son numéro, confirme sur son téléphone, les crédits sont ajoutés dès réception de la confirmation. | P0 |
| F24 | Paiement Flooz | Même flux que Tmoney mais via Flooz. | P0 |
| F25 | Confirmation d'achat | Page/écran de confirmation après un paiement réussi : nombre de crédits ajoutés, nouveau solde, bouton pour retourner à la création. | P0 |
| F26 | Gestion des paiements échoués | Si le paiement échoue ou timeout, l'utilisateur voit un message clair avec la raison et la possibilité de réessayer. Aucun crédit n'est débité. | P0 |

### Galerie personnelle

| # | Feature | Description | Priorité |
|---|---------|-------------|----------|
| F27 | Historique des générations | Toutes les images et vidéos générées par l'utilisateur, affichées en grille avec vignettes, triées par date (plus récent en premier). | P0 |
| F28 | Filtrage par type | L'utilisateur filtre sa galerie par « Images » ou « Vidéos ». | P1 |
| F29 | Détail d'une génération | En cliquant sur un élément, l'utilisateur voit : l'image/vidéo en grand, le prompt utilisé, le modèle, la date. Bouton « Réutiliser ce prompt » qui pré-remplit la page de génération. | P0 |
| F30 | Téléchargement individuel | Télécharger n'importe quelle génération passée en un clic. | P0 |
| F31 | Suppression | L'utilisateur peut supprimer une génération de sa galerie (avec confirmation). | P2 |

### Administration (Kalim)

| # | Feature | Description | Priorité |
|---|---------|-------------|----------|
| F32 | Dashboard métriques | Vue d'ensemble : revenus du jour/semaine/mois, nombre total d'utilisateurs, nombre de générations, crédits vendus vs consommés. | P1 |
| F33 | Liste des utilisateurs | Tableau de tous les inscrits avec : email, date d'inscription, solde actuel, nombre total de générations. Recherche et tri. | P1 |
| F34 | Crédit/débit manuel | L'admin peut ajouter ou retirer des crédits d'un compte utilisateur (pour le support, les offres promo, les beta-testeurs). Avec un champ « motif » obligatoire. | P1 |
| F35 | Gestion du catalogue de modèles | L'admin ajoute un nouveau modèle IA (nom, description, type, coût en crédits, exemples, statut actif/inactif) ou désactive un modèle existant. | P1 |
| F36 | Historique des transactions | Liste de tous les achats de crédits avec : utilisateur, montant FCFA, moyen de paiement, statut (réussi/échoué/en attente), date. Filtrable. | P1 |

---

## 5. User Stories principales

### US1 — Inscription et premiers pas
**En tant que** Aminata (aspirante créatrice), **je veux** créer un compte en quelques secondes avec mon email ou Google **afin de** commencer à explorer les modèles IA sans friction.

**Critères d'acceptation :**
- L'inscription prend moins de 3 étapes (email/mdp → confirmation → arrivée sur le dashboard).
- Après inscription, Aminata arrive sur le dashboard avec un solde de 0 crédits et un message l'invitant à acheter son premier pack.
- L'inscription via Google fonctionne sans étape supplémentaire.

---

### US2 — Découvrir les modèles disponibles
**En tant que** Aminata, **je veux** parcourir le catalogue de modèles avec des exemples de résultats et le coût en crédits de chacun **afin de** comprendre quel modèle utiliser pour créer mon influenceuse IA sans me tromper.

**Critères d'acceptation :**
- Chaque modèle affiche au moins 2 exemples visuels de résultats.
- Le coût en crédits est visible directement dans la liste, sans cliquer.
- Les filtres image/vidéo fonctionnent et mettent à jour la liste instantanément.
- Les modèles inactifs (désactivés par l'admin) n'apparaissent pas dans le catalogue utilisateur.

---

### US3 — Acheter des crédits en mobile money
**En tant que** Kofi, **je veux** acheter un pack de crédits en payant avec Tmoney depuis mon téléphone **afin de** pouvoir lancer des générations sans avoir besoin d'une carte bancaire.

**Critères d'acceptation :**
- Les 3 packs sont affichés avec prix en FCFA et nombre de crédits.
- Le pack Pro est mis en avant avec un badge « Meilleur rapport qualité/prix ».
- Après sélection d'un pack et choix de Tmoney, Kofi reçoit une notification sur son téléphone pour confirmer le paiement.
- Les crédits sont ajoutés au solde dans les 30 secondes suivant la confirmation du paiement.
- En cas d'échec, un message clair s'affiche avec option de réessayer. Le solde reste inchangé.
- La transaction apparaît dans l'historique du wallet avec le statut correct.

---

### US4 — Générer une image d'influenceuse
**En tant que** Kofi, **je veux** écrire un prompt décrivant mon influenceuse, choisir un modèle image de haute qualité, et lancer la génération **afin d'** obtenir une image réaliste utilisable pour mon contenu TikTok.

**Critères d'acceptation :**
- Le champ prompt accepte le français et l'anglais, sans limite de caractères restrictive (minimum 500 caractères autorisés).
- Le coût exact en crédits est affiché avant confirmation.
- Si le solde est insuffisant, le bouton de génération est désactivé et un lien vers l'achat de crédits est proposé.
- Après confirmation, un indicateur de progression s'affiche pendant la génération.
- L'image résultante s'affiche sans watermark.
- Les boutons « Télécharger », « Relancer » et « Modifier le prompt » sont accessibles sous le résultat.
- L'image est automatiquement sauvegardée dans la galerie personnelle.
- Le solde de crédits est mis à jour en temps réel après la génération.

---

### US5 — Générer une vidéo virale
**En tant que** Kofi, **je veux** écrire un prompt, choisir un modèle vidéo, sélectionner la durée, et générer un clip de mon influenceuse **afin de** créer du contenu vidéo de qualité à poster sur TikTok.

**Critères d'acceptation :**
- Le coût en crédits se met à jour dynamiquement quand Kofi change de modèle ou de durée.
- La durée est sélectionnable (3s, 5s, 10s selon le modèle).
- Un indicateur de progression avec estimation du temps restant s'affiche (les vidéos peuvent prendre plus de temps que les images).
- Le clip résultant est prévisualisable dans un player intégré avant téléchargement.
- La vidéo est téléchargeable dans un format directement publiable sur TikTok (MP4, ratio 9:16 si sélectionné).
- La vidéo est automatiquement sauvegardée dans la galerie.

---

### US6 — Retrouver et réutiliser une création passée
**En tant que** Kofi, **je veux** retrouver une image que j'ai générée la semaine dernière et réutiliser exactement le même prompt **afin de** créer des variations cohérentes de mon influenceuse sans réécrire le prompt à chaque fois.

**Critères d'acceptation :**
- La galerie affiche toutes les générations passées en grille, avec vignettes visibles.
- En cliquant sur une génération, le prompt utilisé est affiché en entier.
- Le bouton « Réutiliser ce prompt » pré-remplit la page de génération avec le même prompt et le même modèle.
- Le téléchargement fonctionne pour toutes les générations passées, même celles datant de plusieurs semaines.

---

### US7 — Créer une vidéo à partir d'une image existante
**En tant que** Kofi, **je veux** uploader une image de mon influenceuse (générée précédemment) et la transformer en clip vidéo **afin de** maintenir la cohérence visuelle de mon personnage entre mes posts.

**Critères d'acceptation :**
- L'upload d'image de référence est optionnel et visible sur la page de génération vidéo.
- Les formats acceptés sont clairement indiqués (JPG, PNG, WEBP).
- L'image uploadée apparaît en aperçu avant la génération.
- Le coût en crédits ne change pas par rapport à une génération vidéo sans image de référence (ou la différence est clairement indiquée).

---

### US8 — Suivre sa consommation
**En tant que** Aminata, **je veux** voir combien de crédits chaque génération m'a coûté et combien il me reste **afin de** gérer mon budget et ne pas avoir de mauvaises surprises.

**Critères d'acceptation :**
- Le solde est visible sur toutes les pages, à tout moment.
- L'historique de consommation liste chaque génération avec son coût unitaire.
- L'historique distingue les achats (crédits ajoutés) des consommations (crédits utilisés).
- L'alerte « solde bas » s'affiche quand le solde descend sous 5 crédits.

---

### US9 — Administrer la plateforme
**En tant que** Kalim (admin), **je veux** voir les métriques du business et gérer les utilisateurs et les modèles depuis un dashboard dédié **afin de** piloter Deoflow efficacement sans outil externe.

**Critères d'acceptation :**
- Le dashboard admin affiche : revenus du jour/semaine/mois, nombre d'inscrits, nombre total de générations, top 5 utilisateurs les plus actifs.
- La liste d'utilisateurs permet de rechercher par email et de voir le solde de chacun.
- Le crédit/débit manuel exige un motif avant validation.
- L'ajout d'un nouveau modèle IA est possible sans intervention technique sur le reste de la plateforme (formulaire admin).
- La désactivation d'un modèle le retire instantanément du catalogue utilisateur mais les générations passées restent visibles dans les galeries.

---

## 6. Business Model & Monétisation

### Modèle de revenus : Crédits prépayés (usage-based)

Pas d'abonnement mensuel. Les utilisateurs achètent des packs de crédits qu'ils consomment à leur rythme. Les crédits ne expirent pas.

**Taux de conversion :**
- 1 image = 1 crédit
- 1 clip vidéo 5 secondes = 5 crédits
- Les coûts varient selon le modèle choisi (détail géré dynamiquement par l'admin dans le backoffice)

### Grille tarifaire

| Pack | Crédits | Prix | Prix/crédit | Badge |
|------|---------|------|-------------|-------|
| Pack Starter | 50 | ~~7 000 FCFA~~ **5 000 FCFA** | 100 FCFA | — |
| Pack Créateur | 120 | ~~14 000 FCFA~~ **10 000 FCFA** | 83 FCFA | Populaire |
| Pack Pro | 300 | ~~30 000 FCFA~~ **20 000 FCFA** | 67 FCFA | Meilleur rapport qualité/prix |

- Le prix barré renforce la perception de valeur et booste la conversion.
- Le pack Pro correspond au plafond psychologique de la cible (= prix du coaching actuel).
- La dégressivité du prix par crédit incite à prendre le pack supérieur.

### Moyens de paiement

| Moyen | Priorité | Zone |
|-------|----------|------|
| **Tmoney** | Obligatoire | Togo |
| **Flooz (Moov Money)** | Obligatoire | Togo, Bénin |
| **Carte bancaire (Visa/Mastercard)** | Complémentaire V2 | Diaspora, autres pays |
| **Wave / Orange Money** | Extension V2 | Sénégal, Côte d'Ivoire, Mali |

Le mobile money (Tmoney + Flooz) est le seul moyen de paiement en V1. C'est le moyen utilisé par 90%+ de la cible togolaise. L'extension à Wave/Orange Money pour la Côte d'Ivoire et le Sénégal arrive en V2 pour couvrir les autres marchés francophones.

### Marges estimées

- Coût API moyen par crédit (image) : 15-180 FCFA selon modèle → prix de vente 67-100 FCFA/crédit.
- Coût API moyen par crédit (vidéo 5s = 5 crédits) : 280-1 050 FCFA → prix de vente 335-500 FCFA (5 crédits).
- **Marge brute cible : 35-50%**, atteinte en orientant les utilisateurs vers les modèles à bon ratio qualité/coût et en ajustant le coût en crédits de chaque modèle dynamiquement.
- L'admin peut modifier le coût en crédits de chaque modèle à tout moment pour protéger la marge.

### Pas de palier gratuit

Pas de freemium. La génération IA coûte cher en infrastructure par requête (GPU-intensive). Offrir des générations gratuites sans contrôle crée un risque d'abus et de perte financière sur chaque utilisateur non-payant. L'acquisition se fait via la communauté de coaching existante et le contenu TikTok de Kalim — pas via un palier gratuit.

**Alternative pour l'acquisition :** Kalim peut créditer manuellement 5-10 crédits offerts à ses coachés ou via des codes promo pour permettre un premier test. Ce n'est pas un freemium structurel — c'est une opération marketing ponctuelle contrôlée.

---

## 7. Métriques de succès

### Métriques de lancement (30 premiers jours)

| Métrique | Objectif | Justification |
|----------|----------|---------------|
| Inscrits | 30 | 21 coachés existants + 9 via le bouche-à-oreille TikTok de Kalim |
| Utilisateurs ayant acheté au moins 1 pack | 15 | 50% de conversion attendue car la cible est pré-qualifiée (coachés) |
| Revenus bruts | 150 000 FCFA | 15 acheteurs × 10 000 FCFA en moyenne |
| Générations totales | 1 500+ | 15 utilisateurs actifs × ~100 générations sur le premier mois |
| Taux de rétention J+7 | > 50% | Un utilisateur qui a payé et généré revient dans la semaine suivante |

### Métriques de croissance (mois 2-3)

| Métrique | Objectif | Justification |
|----------|----------|---------------|
| Inscrits cumulés | 100 | Croissance via le contenu TikTok de Kalim montrant des résultats faits avec Deoflow |
| Utilisateurs payants actifs/mois | 40 | 40% de taux de conversion (marché pré-qualifié) |
| Revenu mensuel récurrent | 400 000 FCFA | 40 payants × 10 000 FCFA moyen |
| Taux de ré-achat | > 60% | Un créateur actif consomme ~220 crédits/mois, il doit racheter |
| NPS (Net Promoter Score) | > 40 | Mesuré via un simple sondage dans l'app |

### North Star Metric

**Nombre de générations par utilisateur actif par semaine.** C'est le signal le plus fiable : un utilisateur qui génère régulièrement = un utilisateur qui trouve de la valeur, qui consomme des crédits, et qui va racheter.

Cible : **15+ générations/semaine** par utilisateur actif (correspond aux 10-15 contenus/semaine observés chez les coachés).

---

## 8. Ce qui est HORS SCOPE V1

| Fonctionnalité exclue | Pourquoi |
|----------------------|----------|
| **Workflows guidés / templates d'influenceuse** | Décision produit de Kalim : mode libre uniquement. Pourra être reconsidéré en V2 si les données montrent que les débutants abandonnent par manque de guidance. |
| **Génération audio / voix IA** | Complexité technique et coûts supplémentaires. Les créateurs utilisent déjà des outils de voix off séparés (CapCut, etc.). |
| **Cohérence automatique de personnage** | Maintenir un visage identique entre générations nécessite des fonctionnalités avancées (face-lock, IP-adapter). Trop complexe pour la V1. Les utilisateurs gèrent la cohérence via leurs prompts et l'image de référence (F18). |
| **App mobile native (iOS/Android)** | Deoflow est une application web responsive accessible sur navigateur mobile. Pas d'app store, pas de binaire natif. 85%+ de la cible utilise le navigateur mobile. |
| **Marketplace de prompts / communauté** | Pas en V1. La communauté existe déjà sur les groupes WhatsApp/TikTok de Kalim. |
| **API publique / accès développeur** | Aucun besoin identifié dans la cible. |
| **Paiement par carte bancaire** | La cible primaire (Togo) utilise Tmoney/Flooz. La carte sera ajoutée en V2 pour la diaspora et l'expansion géographique. |
| **Wave / Orange Money** | Priorité V2 pour l'expansion vers le Sénégal et la Côte d'Ivoire. La V1 cible le Togo (21 coachés = tous togolais ou utilisant Tmoney/Flooz). |
| **Multi-langue (anglais)** | Interface en français uniquement en V1. La cible est 100% francophone. |
| **Système de parrainage / affiliation** | Bonne idée mais pas prioritaire. La croissance V1 passe par le contenu TikTok de Kalim. |
| **Éditeur intégré (montage vidéo, retouche image)** | Les créateurs utilisent déjà CapCut pour le montage. Deoflow se concentre sur la génération, pas l'édition. |

---

## 9. Risques et mitigation

### Risque 1 — Faible barrière à la copie
**Description :** Un développeur ou un concurrent (Fefefe, un autre dev togolais) peut brancher les mêmes API avec Tmoney et reproduire Deoflow en 2-3 semaines. Sans workflow différenciant, la plateforme est un "simple" agrégateur.

**Mitigation :**
- La distribution est l'avantage : Kalim a une audience TikTok, une communauté de 21 coachés, et une crédibilité de praticien. Même produit identique, un concurrent n'a pas cette audience.
- Vitesse d'exécution : être premier sur ce créneau spécifique (créateurs TikTok influenceuses IA × Afrique francophone × mobile money) crée un avantage de réseau et de rétention (galerie de créations, habitudes).
- Si un concurrent émerge, reconsidérer l'ajout de workflows guidés comme différenciateur fonctionnel.

### Risque 2 — Coûts API imprévisibles qui écrasent les marges
**Description :** Les coûts d'inférence vidéo IA sont très élevés et fluctuent. Sora a démontré le problème : 2,1M$ de revenus vs 15M$/jour de coûts. Un modèle populaire qui augmente ses prix peut rendre un pack non rentable du jour au lendemain.

**Mitigation :**
- L'admin peut ajuster le coût en crédits de chaque modèle à tout moment, sans modifier les prix des packs.
- Surveiller les marges par modèle chaque semaine. Retirer les modèles non rentables.
- Toujours proposer au moins un modèle "budget" (type Flux Schnell, Wan 2.5) à côté des modèles premium.
- Le modèle prépayé (pas d'abonnement illimité) protège naturellement : chaque génération est financée par des crédits déjà achetés.

### Risque 3 — Adoption lente hors de la communauté de coaching
**Description :** Les 21 coachés sont une base solide mais limitée. Si le produit ne se diffuse pas au-delà de ce cercle, les revenus plafonnent à ~400 000 FCFA/mois (ce qui ne couvre peut-être pas les coûts fixes).

**Mitigation :**
- Kalim utilise Deoflow en live sur TikTok pour créer du contenu, montrant les résultats en temps réel → acquisition organique.
- Les créateurs qui utilisent Deoflow produisent du contenu qui fait naturellement la promo de la plateforme (effet réseau indirect).
- Extension des moyens de paiement en V2 (Wave, Orange Money) pour débloquer le Sénégal et la Côte d'Ivoire.
- Considérer un programme de parrainage (ex: « invite un ami, tu gagnes 10 crédits ») en V2.

### Risque 4 — Expérience décevante pour les débutants
**Description :** Aminata (persona débutante) ne sait pas quel modèle choisir ni comment écrire un bon prompt. Sans guidance, elle gaspille ses crédits sur de mauvais résultats, se frustre et abandonne.

**Mitigation :**
- Exemples de prompts affichés dans la page de génération (suggestions cliquables : « Portrait influenceuse réaliste, fond studio, lumière douce »).
- Exemples de résultats sur chaque fiche modèle pour aider au choix.
- FAQ ou guide court « Comment écrire un bon prompt » accessible depuis la page de génération.
- Kalim peut adresser ce problème dans son coaching (bridge entre le coaching et le produit).

### Risque 5 — Dépendance à un seul fournisseur d'API (FAL.AI)
**Description :** FAL.AI détient 50% de parts de marché images et 44% vidéo. Si FAL.AI augmente ses prix, tombe en panne, ou change ses conditions, Deoflow est bloqué.

**Mitigation :**
- L'architecture du catalogue de modèles doit permettre de brancher plusieurs fournisseurs d'API (FAL.AI, Replicate, RunPod, etc.) sans refonte.
- Toujours maintenir au moins 2 modèles images et 2 modèles vidéos venant de fournisseurs différents.
- Surveiller les alternatives et tester régulièrement de nouveaux fournisseurs.