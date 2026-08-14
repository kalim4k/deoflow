'use client';

// Détail d'une génération (F29) : le média en grand, le prompt en entier, et
// le bouton « Réutiliser ce prompt » qui pré-remplit l'atelier avec le même
// modèle — c'est ce qui permet de décliner un personnage sans tout retaper.

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { Button, buttonStyles } from '@/components/ui/Button';
import { Alert, Badge, Card, EmptyState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { ArrowLeftIcon, DownloadIcon, ImageIcon, RefreshIcon, TrashIcon } from '@/components/icons';
import { deleteGeneration, fetchGeneration, type ApiGeneration } from '@/lib/deoflow/api';
import { downloadUrl, generationFilename } from '@/lib/deoflow/download';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';

export default function GenerationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generation, setGeneration] = useState<ApiGeneration | null>(null);
  const [loading, setLoading] = useState(true);

  // La galerie vit en base : on relit la generation plutot que de dependre
  // d'une liste deja chargee — un lien partage ou un rafraichissement doit
  // fonctionner sans passer par /gallery.
  useEffect(() => {
    let cancelled = false;
    void fetchGeneration(id)
      .then((row) => {
        if (!cancelled) setGeneration(row);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <AppShell>
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="aspect-[4/3] animate-pulse rounded-2xl bg-sunken" />
          <div className="h-64 animate-pulse rounded-2xl bg-sunken" />
        </div>
      </AppShell>
    );
  }

  if (!generation) {
    return (
      <AppShell>
        <EmptyState
          icon={<ImageIcon className="size-8" />}
          title="Création introuvable"
          description="Elle a peut-être été supprimée."
          action={
            <Link href="/gallery" className={buttonStyles('secondary', 'sm')}>
              Retour à la galerie
            </Link>
          }
        />
      </AppShell>
    );
  }

  const asset = generation.urls[0];
  const reuseHref = `/create/${generation.kind === 'video' ? 'video' : 'image'}?model=${
    generation.modelSlug
  }&prompt=${encodeURIComponent(generation.prompt)}`;

  async function onDelete() {
    if (!generation) return;
    setDeleting(true);
    try {
      await deleteGeneration(generation.id);
      toast('Création supprimée.', 'success');
      router.push('/gallery');
    } catch {
      toast('La suppression a échoué.', 'error');
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Link
          href="/gallery"
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
        >
          <ArrowLeftIcon className="size-4" />
          Galerie
        </Link>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
          <div className="checkerboard overflow-hidden rounded-2xl border border-line">
            {asset ? (
              generation.kind === 'video' ? (
                <video src={asset} controls playsInline className="mx-auto max-h-[34rem] w-auto" />
              ) : (
                <img
                  src={asset}
                  alt={generation.prompt}
                  className="mx-auto max-h-[34rem] w-auto object-contain"
                />
              )
            ) : (
              <p className="p-10 text-center text-sm text-ink-300">
                {generation.status === 'FAILED'
                  ? (generation.failureReason ??
                    'Cette generation a echoue. Vos credits vous ont ete rendus.')
                  : 'Generation en cours…'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-3">
              <h1 className="font-display text-lg">Le prompt utilisé</h1>
              <p className="rounded-xl bg-sunken p-4 text-sm leading-relaxed text-ink-700">
                {generation.prompt}
              </p>
              <Link href={reuseHref} className={buttonStyles('primary', 'md', 'w-full')}>
                <RefreshIcon className="size-4" />
                Réutiliser ce prompt
              </Link>
            </Card>

            <Card className="flex flex-col gap-3">
              <h2 className="font-display text-lg">Détails</h2>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Modèle</dt>
                  <dd>
                    <Link
                      href={`/models/${generation.modelSlug}`}
                      className="cursor-pointer text-ember-600 hover:underline"
                    >
                      {generation.modelName}
                    </Link>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Type</dt>
                  <dd>
                    <Badge tone="neutral">{generation.kind === 'video' ? 'Vidéo' : 'Image'}</Badge>
                  </dd>
                </div>
                {generation.ratio ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-500">Format</dt>
                    <dd className="text-ink-900">{generation.ratio}</dd>
                  </div>
                ) : null}
                {generation.durationSeconds ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-500">Durée</dt>
                    <dd className="text-ink-900">{generation.durationSeconds} secondes</dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Coût</dt>
                  <dd className="text-ink-900">{generation.credits} crédits</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-500">Créée le</dt>
                  <dd className="text-ink-900">{formatDateTime(generation.createdAt)}</dd>
                </div>
              </dl>

              <div className="mt-1 flex flex-wrap gap-2">
                {asset && (
                  // Pas de `target="_blank"` : avec `fl_attachment`, le CDN
                  // répond en pièce jointe. Un nouvel onglet s'ouvrirait pour
                  // se refermer aussitôt, ce qui a l'air d'un bug.
                  <a
                    href={downloadUrl(
                      asset,
                      generationFilename(generation.modelSlug, generation.id),
                    )}
                    download
                    className={buttonStyles('secondary', 'md')}
                  >
                    <DownloadIcon className="size-4" />
                    Télécharger
                  </a>
                )}
                <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                  <TrashIcon className="size-4" />
                  Supprimer
                </Button>
              </div>
            </Card>

            <Alert tone="info">
              Aperçu simulé : la génération réelle sera branchée avec le fournisseur d&apos;IA.
            </Alert>
          </div>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Supprimer cette création ?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-500">
            Elle disparaîtra définitivement de votre galerie. Les crédits déjà consommés ne sont pas
            remboursés.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void onDelete()}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
