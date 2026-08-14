'use client';

// Fiche d'un personnage : son visage, sa description, et de quoi la corriger.
//
// Modifier le texte est GRATUIT — rien n'est régénéré. Seul « régénérer le
// visage » coûte des crédits, et son prix est affiché avant le clic.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppLink } from '@/components/NavProgress';
import { AppShell } from '@/components/app/AppShell';
import { AvatarDetailSkeleton } from '@/components/app/AvatarDetailSkeleton';
import { Button, buttonStyles } from '@/components/ui/Button';
import { InputField, TextareaField } from '@/components/ui/Field';
import { Alert, Badge, Card } from '@/components/ui/Feedback';
import { ArrowLeftIcon, RefreshIcon, SpinnerIcon, TrashIcon, UserIcon } from '@/components/icons';
import { deleteAvatar, fetchAvatar, updateAvatar, type ApiAvatar } from '@/lib/deoflow/api';
import { priceCredits } from '@/lib/deoflow/pricing';
import { useCreditsContext } from '@/contexts/CreditsContext';
import { useToast } from '@/contexts/ToastContext';
import { errorMessage } from '@/lib/errorMessages';

export default function AvatarPage() {
  const id = String(useParams().id ?? '');
  const router = useRouter();
  const { toast } = useToast();
  const { refresh: refreshCredits } = useCreditsContext();

  const [avatar, setAvatar] = useState<ApiAvatar | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le visage se résout côté serveur à la lecture : on rappelle tant qu'il est
  // en cours, plutôt que de laisser le créateur rafraîchir à la main.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: number | undefined;

    async function load(silent: boolean) {
      try {
        const row = await fetchAvatar(id);
        if (cancelled) return;
        setAvatar(row);
        if (!silent) {
          setName(row.name);
          setDescription(row.description);
        }
        if (row.status === 'PENDING') timer = window.setTimeout(() => void load(true), 4000);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    }

    void load(false);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  const dirty =
    avatar !== null && (name.trim() !== avatar.name || description.trim() !== avatar.description);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      setAvatar(await updateAvatar(id, { name: name.trim(), description: description.trim() }));
      toast('Personnage mis à jour.', 'success');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setError(null);
    setRegenerating(true);
    try {
      // La description à jour est enregistrée avec la demande : régénérer sur
      // l'ancienne ferait payer un visage que le créateur vient de corriger.
      setAvatar(
        await updateAvatar(id, {
          name: name.trim(),
          description: description.trim(),
          regenerateFace: true,
        }),
      );
      await refreshCredits();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRegenerating(false);
    }
  }

  async function remove() {
    if (!window.confirm('Supprimer ce personnage ? Vos générations passées sont conservées.')) {
      return;
    }
    try {
      await deleteAvatar(id);
      toast('Personnage supprimé.', 'success');
      router.push('/avatars');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!avatar) {
    if (error) {
      return (
        <AppShell>
          <div className="mx-auto flex max-w-md flex-col gap-4">
            <Alert tone="error">{error}</Alert>
            <AppLink href="/avatars" className={buttonStyles('secondary', 'md', 'w-full')}>
              Mes personnages
            </AppLink>
          </div>
        </AppShell>
      );
    }
    // Le même squelette que `loading.tsx` : la fiche est déjà à l'écran depuis
    // le clic, elle se remplit sans que rien ne bouge.
    return <AvatarDetailSkeleton />;
  }

  const cost = priceCredits(avatar.modelSlug) ?? 0;

  return (
    <AppShell title={avatar.name} description="Son visage et sa description.">
      <div className="flex flex-col gap-6">
        <AppLink
          href="/avatars"
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
        >
          <ArrowLeftIcon className="size-4" />
          Mes personnages
        </AppLink>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <Card className="flex flex-col gap-3">
            <div className="checkerboard relative aspect-square overflow-hidden rounded-xl bg-sunken">
              {avatar.faceUrl ? (
                <img src={avatar.faceUrl} alt={avatar.name} className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-ink-300">
                  {avatar.status === 'PENDING' ? (
                    <div className="flex flex-col items-center gap-2">
                      <SpinnerIcon className="size-7" />
                      <span className="text-xs">Génération du visage…</span>
                    </div>
                  ) : (
                    <UserIcon className="size-8" />
                  )}
                </div>
              )}
            </div>

            {avatar.status === 'FAILED' && (
              <Alert tone="error">
                La génération du visage a échoué. Vos crédits vous ont été rendus — vous pouvez
                réessayer ci-dessous.
              </Alert>
            )}

            <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
              <span>Visage généré par {avatar.modelSlug}</span>
              <Badge tone={avatar.status === 'READY' ? 'gain' : 'neutral'}>
                {avatar.status === 'READY'
                  ? 'Prêt'
                  : avatar.status === 'PENDING'
                    ? 'En cours'
                    : 'Échec'}
              </Badge>
            </div>

            <Button
              variant="secondary"
              onClick={() => void regenerate()}
              loading={regenerating}
              disabled={avatar.status === 'PENDING'}
              className="w-full"
            >
              <RefreshIcon className="size-4" />
              Régénérer — {cost} crédits
            </Button>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-4">
              <InputField
                label="Nom"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <TextareaField
                label="Description"
                aside={`${description.length} / 4000`}
                rows={6}
                maxLength={4000}
                hint="Jointe à chacune de vos générations. La modifier ne coûte rien et ne régénère pas le visage."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
                  Enregistrer
                </Button>
                {dirty && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setName(avatar.name);
                      setDescription(avatar.description);
                    }}
                  >
                    Annuler
                  </Button>
                )}
              </div>
            </Card>

            <Card className="flex flex-col gap-3">
              <h2 className="font-display text-base">Utiliser ce personnage</h2>
              <p className="text-xs text-ink-500">
                Sélectionnez-le dans l’atelier : son visage et sa description partiront
                automatiquement avec votre description de scène.
              </p>
              <div className="flex flex-wrap gap-2">
                <AppLink href="/create/image" className={buttonStyles('ember', 'sm')}>
                  Générer une image
                </AppLink>
                <AppLink href="/create/video" className={buttonStyles('secondary', 'sm')}>
                  Générer une vidéo
                </AppLink>
              </div>
            </Card>

            <button
              type="button"
              onClick={() => void remove()}
              className="pressable inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-loss-600 hover:text-loss-700"
            >
              <TrashIcon className="size-4" />
              Supprimer ce personnage
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
