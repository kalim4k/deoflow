'use client';

// Visualisation d'un rendu depuis le back-office.
//
// Sert à traiter un signalement : on ne peut pas juger un contenu sans le
// regarder. Le prompt est affiché à côté du média parce que juger une image
// sans savoir ce qui a été demandé n'a pas de sens — les deux vont ensemble ou
// pas du tout.
//
// Rien n'est affiché dans la liste : il faut ouvrir la fiche. Un geste
// délibéré, pas une exposition passive du contenu de tous les créateurs à
// quiconque ouvre l'écran.

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, StatusBadge } from '@/components/ui/Feedback';
import { ImageIcon, VideoIcon } from '@/components/icons';
import type { AdminGeneration } from '@/lib/deoflow/adminApi';
import { formatDateTime } from '@/lib/format';

export function GenerationPreview({
  generation,
  onClose,
}: {
  generation: AdminGeneration | null;
  onClose: () => void;
}) {
  if (!generation) return null;

  const isVideo = generation.kind === 'video';
  const done = generation.status === 'SUCCEEDED';

  return (
    <Modal open onClose={onClose} title={generation.modelName}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={generation.status} />
          <Badge tone="neutral">{isVideo ? 'Vidéo' : 'Image'}</Badge>
          <Badge tone="neutral">{generation.mode}</Badge>
          {generation.purpose === 'AVATAR' ? <Badge tone="ink">Personnage</Badge> : null}
          <span className="text-xs text-ink-300">
            {generation.credits} cr. · {formatDateTime(generation.createdAt)}
          </span>
        </div>

        {/* Le rendu. `checkerboard` révèle la transparence — un PNG à fond
            transparent sur fond blanc paraîtrait vide, et on conclurait à tort
            que la génération a raté. */}
        {generation.urls.length > 0 ? (
          <div className="flex flex-col gap-2">
            {generation.urls.map((url) =>
              isVideo ? (
                <video
                  key={url}
                  src={url}
                  controls
                  playsInline
                  // Pas d'autoplay : sur une 4G togolaise, lancer une vidéo
                  // sans y avoir été invité coûte des données à l'administrateur.
                  preload="metadata"
                  className="w-full rounded-xl border border-line bg-sunken"
                />
              ) : (
                // Balise native et non `next/image` : les URLs Cloudinary sont
                // externes et l'optimiseur n'apporte rien sur un écran ouvert
                // ponctuellement par une seule personne. C'est aussi ce que
                // font la galerie et les fiches de personnage.
                <img
                  key={url}
                  src={url}
                  alt={`Rendu de la génération ${generation.id}`}
                  loading="lazy"
                  className="checkerboard w-full rounded-xl border border-line"
                />
              ),
            )}
          </div>
        ) : done ? (
          <Alert tone="warning">
            Génération réussie mais aucun fichier enregistré. Les URLs kie.ai sont temporaires : si
            la copie vers Cloudinary a échoué, le rendu est définitivement perdu.
          </Alert>
        ) : generation.status === 'FAILED' ? (
          <Alert tone="error">
            {generation.failureCode ? <strong>{generation.failureCode} — </strong> : null}
            {generation.failureReason ?? 'Échec sans motif enregistré.'} Les crédits ont été rendus
            automatiquement.
          </Alert>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
            {isVideo ? (
              <VideoIcon className="size-8 text-ink-300" />
            ) : (
              <ImageIcon className="size-8 text-ink-300" />
            )}
            <p className="text-sm text-ink-500">Génération en cours — rien à afficher encore.</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-ink-500">Prompt envoyé au fournisseur</p>
          {/* `whitespace-pre-wrap` : le prompt composé avec un personnage porte
              des retours à la ligne qui en portent le sens. */}
          <p className="max-h-48 overflow-y-auto rounded-xl bg-sunken p-3 text-sm whitespace-pre-wrap text-ink-700">
            {generation.prompt}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-ink-500">Compte</dt>
          <dd className="truncate text-ink-700">{generation.user?.email ?? generation.userId}</dd>
          <dt className="text-ink-500">Modèle</dt>
          <dd className="font-mono text-ink-700">{generation.modelSlug}</dd>
          {generation.ratio ? (
            <>
              <dt className="text-ink-500">Format</dt>
              <dd className="text-ink-700">{generation.ratio}</dd>
            </>
          ) : null}
          {generation.durationSeconds ? (
            <>
              <dt className="text-ink-500">Durée</dt>
              <dd className="text-ink-700">{generation.durationSeconds} s</dd>
            </>
          ) : null}
          {generation.providerTaskId ? (
            <>
              <dt className="text-ink-500">Tâche {generation.provider}</dt>
              <dd className="truncate font-mono text-ink-700">{generation.providerTaskId}</dd>
            </>
          ) : null}
        </dl>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Fermer
          </Button>
          {generation.urls[0] ? (
            <a
              href={generation.urls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="pressable inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-line px-4 text-sm text-ink-700 hover:border-line-strong"
            >
              Ouvrir en grand
            </a>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
