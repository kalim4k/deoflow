# Tâches planifiées

Deoflow a **7 tâches de fond**. Deux tournent sur Vercel, cinq sont appelées depuis
[cron-job.org](https://cron-job.org). L'inventaire complet vit dans
[frontend/cron-schedule.json](frontend/cron-schedule.json) — c'est la source de vérité, et des tests
la comparent au disque et à `vercel.json` à chaque `pnpm test`.

## Pourquoi ce partage

Le plan **Vercel Hobby n'accepte que des cadences quotidiennes**. Déclarer une seule tâche plus
fréquente dans `vercel.json` fait échouer le déploiement entier, avec ce message :

```
Hobby accounts are limited to daily cron jobs. This cron expression (*/1 * * * *)
would run more than once per day.
```

Cinq de nos sept tâches tournent à la minute, aux cinq minutes ou à l'heure. Les passer en quotidien
n'était pas envisageable : `purchase-reconcile` est la seule chose qui livre les crédits payés, et
`email-queue-drain` la seule qui envoie les codes de vérification. Un acheteur aurait attendu son
solde jusqu'à 24 h, un inscrit son code tout autant.

Les routes acceptent `GET` **et** `POST`, et ne demandent qu'un en-tête `Authorization` — donc
n'importe quel planificateur HTTP fait l'affaire. Vercel n'a pas besoin d'être celui qui appuie.

## Les deux tâches sur Vercel

Déclarées dans [frontend/vercel.json](frontend/vercel.json), enregistrées automatiquement au
déploiement. Rien à faire.

| Tâche | Cadence |
| --- | --- |
| `/api/cron/webhook-log-purge` | quotidien, 00:00 UTC |
| `/api/cron/email-job-purge` | quotidien, 00:00 UTC |

## Les cinq tâches sur cron-job.org

À créer **une fois**, à la main. Remplacez `<domaine>` par votre domaine Vercel.

| Tâche | Cadence | Si elle s'arrête |
| --- | --- | --- |
| `https://<domaine>/api/cron/purchase-reconcile` | 5 min | **Les crédits payés ne sont jamais livrés.** MakeTou n'a aucun webhook. |
| `https://<domaine>/api/cron/email-queue-drain` | 1 min | **Aucun e-mail ne part**, dont les codes de vérification : plus personne ne peut finir son inscription. |
| `https://<domaine>/api/cron/outbox-drain` | 1 min | Les effets de bord des webhooks s'empilent en base sans partir. |
| `https://<domaine>/api/cron/order-expiration` | 5 min | Les commandes abandonnées restent `PENDING` et faussent les agrégats du back-office. |
| `https://<domaine>/api/cron/verification-cleanup` | 1 h | Les codes périmés s'accumulent. Nuisance, pas panne. |

### Créer une tâche

1. Compte gratuit sur [cron-job.org](https://console.cron-job.org) → **Créer un cronjob**.
2. **Titre** : le nom de la tâche, pour vous y retrouver.
3. **URL** : la ligne du tableau ci-dessus.
4. **Exécution** : choisir la cadence. Le mode « expression personnalisée » accepte directement
   `*/5 * * * *`.
5. Onglet **Avancé** :
   - **Méthode de requête** : `GET`
   - **En-têtes** → ajouter :

     | Nom | Valeur |
     | --- | --- |
     | `Authorization` | `Bearer VOTRE_CRON_SECRET` |

   `VOTRE_CRON_SECRET` est la valeur de `CRON_SECRET` — la même que dans `frontend/.env` et dans
   les variables d'environnement Vercel. **Les trois doivent être identiques**, sinon les tâches
   répondent 401.
6. Activer les **notifications en cas d'échec** : c'est ce qui vous préviendra qu'une tâche ne passe
   plus. Sans elles, une tâche morte est parfaitement silencieuse.
7. Enregistrer, puis **Exécuter maintenant** pour vérifier : la réponse doit être `200`.

### Deux pièges

**Un 401 signifie un secret qui ne correspond pas**, pas une tâche cassée. Vérifiez que la valeur
Vercel et celle de cron-job.org sont bien la même chaîne, sans espace ni retour à la ligne collé.

**Un échec par dépassement de délai ne veut pas dire que le travail n'a pas eu lieu.** Les drains
traitent jusqu'à 100 lignes par passage et déclarent `maxDuration = 60`. Si cron-job.org coupe
l'attente avant la fin, il marque un échec alors que la fonction continue côté Vercel. Ne relancez
pas à la main — le passage suivant reprendra le reste de toute façon.

## Vérifier que tout tourne

Depuis votre machine, avec le secret de production :

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<domaine>/api/cron/purchase-reconcile
```

`200` = la tâche s'exécute. `401` = mauvais secret. `405` = la route n'expose pas `GET` (régression :
le test `src/lib/server/cron/vercel-verb.test.ts` aurait dû l'attraper). `500 CRON_NOT_CONFIGURED` =
`CRON_SECRET` absent des variables Vercel.

## Si vous passez sur Vercel Pro

La contrainte disparaît : les 7 tâches peuvent revenir sur Vercel.

1. Dans [frontend/cron-schedule.json](frontend/cron-schedule.json), passer `vercelPlan` à `"pro"` et
   chaque `trigger` à `"vercel"`.
2. Recopier les 7 entrées dans `frontend/vercel.json` avec leurs cadences.
3. `pnpm test` — les tests d'inventaire vérifient que les deux fichiers concordent.
4. **Supprimer les 5 tâches sur cron-job.org**, sinon elles continuent d'appeler les routes en
   parallèle de Vercel. Ce n'est pas dangereux (les baux Redis de `leader-lease.ts` empêchent deux
   passages simultanés) mais c'est du bruit et de la charge inutile.
