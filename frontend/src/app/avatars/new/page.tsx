'use client';

// Création d'un influenceur.
//
// Trois choses seulement : un nom, une description libre, et de quoi générer le
// visage — un prompt seul, ou une photo de départ.
//
// Le cadrage et le fond blanc ne sont PAS demandés au créateur : ce sont des
// contraintes système, imposées côté serveur (`lib/server/avatars/portrait.ts`).
// Un visage pris dans un décor traînerait ce décor dans toutes ses scènes.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppLink } from '@/components/NavProgress';
import { AppShell } from '@/components/app/AppShell';
import { Button, buttonStyles } from '@/components/ui/Button';
import { InputField, TextareaField } from '@/components/ui/Field';
import { Alert, Card } from '@/components/ui/Feedback';
import { ArrowLeftIcon, CloseIcon, InfoIcon, UploadIcon } from '@/components/icons';
import { createAvatar, uploadReference } from '@/lib/deoflow/api';
import { AI_MODELS } from '@/lib/deoflow/catalog';
import { priceCredits } from '@/lib/deoflow/pricing';
import { useCreditsContext } from '@/contexts/CreditsContext';
import { errorMessage } from '@/lib/errorMessages';
import { cn } from '@/lib/cn';

/** Les deux seuls modèles capables de produire un portrait — voir `portrait.ts`. */
const FACE_MODELS = ['nano-banana-2', 'gpt-image-2'] as const;

export default function NewAvatarPage() {
  const router = useRouter();
  const { credits, refresh: refreshCredits } = useCreditsContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modelSlug, setModelSlug] = useState<string>(FACE_MODELS[0]);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [rightsAck, setRightsAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = priceCredits(modelSlug) ?? 0;
  const insufficient = cost > credits;

  const blocker: string | null = (() => {
    if (name.trim().length === 0) return 'Donnez un nom à votre personnage.';
    if (!photo && description.trim().length === 0) {
      return 'Décrivez votre personnage, ou partez d’une photo.';
    }
    if (photo && !rightsAck) return 'Confirmez que vous disposez des droits sur cette photo.';
    if (insufficient) return `Il vous manque ${cost - credits} crédits.`;
    return null;
  })();

  function pickPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choisissez une image.');
      return;
    }
    setError(null);
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto({ file, preview: URL.createObjectURL(file) });
  }

  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    setRightsAck(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (blocker) {
      setError(blocker);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      // La photo part d'abord vers notre stockage : le fournisseur télécharge
      // les références depuis SES serveurs, un `blob:` local ne lui dit rien.
      const photoUrl = photo ? await uploadReference(photo.file) : null;

      const avatar = await createAvatar(
        {
          name: name.trim(),
          description: description.trim(),
          modelSlug,
          photoUrl,
          photoRightsAck: rightsAck,
        },
        crypto.randomUUID(),
      );
      await refreshCredits();
      // La fiche montre l'avancement de la génération et le résultat.
      router.push(`/avatars/${avatar.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Nouvel avatar"
      description="Un visage et une description, réutilisables partout."
    >
      <div className="flex flex-col gap-6">
        <AppLink
          href="/avatars"
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
        >
          <ArrowLeftIcon className="size-4" />
          Mes personnages
        </AppLink>

        <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-4">
              <InputField
                label="Nom"
                required
                maxLength={60}
                placeholder="Awa"
                hint="Pour vous y retrouver — il n’est pas envoyé au modèle."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <TextareaField
                label="Description"
                aside={`${description.length} / 4000`}
                rows={5}
                maxLength={4000}
                placeholder="Jeune femme togolaise de 24 ans, mince, 1m68, tresses longues, style afro-urbain, grandes boucles d’oreilles dorées…"
                hint="Le corps, la tenue, le style. Ce texte sera joint à chacune de vos générations : vous n’aurez plus à le réécrire."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Card>

            <Card className="flex flex-col gap-3">
              <div>
                <h2 className="font-display text-base">Photo de départ</h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  Facultative. Sans elle, le visage est inventé à partir de votre description.
                </p>
              </div>

              {photo ? (
                <div className="flex items-start gap-3">
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-line">
                    <img src={photo.preview} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={clearPhoto}
                      aria-label="Retirer la photo"
                      className="pressable absolute right-1 top-1 grid size-6 cursor-pointer place-items-center rounded-full bg-ink-900/70 text-white hover:bg-ink-900"
                    >
                      <CloseIcon className="size-3" />
                    </button>
                  </div>

                  {/* Créer un influenceur à partir du visage d'une vraie
                      personne engage le créateur. Ce n'est pas de la conformité
                      sérieuse, c'est le minimum honnête. */}
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-700">
                    <input
                      type="checkbox"
                      checked={rightsAck}
                      onChange={(e) => setRightsAck(e.target.checked)}
                      className="mt-0.5 size-4 cursor-pointer accent-ember-500"
                    />
                    Je dispose des droits sur cette photo, ou la personne représentée a donné son
                    accord.
                  </label>
                </div>
              ) : (
                <label
                  className={cn(
                    'pressable flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong bg-sunken px-4 py-6 text-center',
                    'hover:border-ink-300',
                  )}
                >
                  <UploadIcon className="size-5 text-ink-300" />
                  <span className="text-sm text-ink-700">
                    Déposez une photo ou{' '}
                    <span className="underline underline-offset-2">parcourez</span>
                  </span>
                  <span className="text-xs text-ink-300">JPG, PNG ou WEBP.</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      pickPhoto(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </Card>
          </div>

          <Card className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-lg">Générer le visage</h2>
              <div className="grid auto-cols-fr grid-flow-col gap-2" role="radiogroup">
                {FACE_MODELS.map((slug) => {
                  const model = AI_MODELS.find((m) => m.slug === slug);
                  const selected = slug === modelSlug;
                  return (
                    <button
                      key={slug}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setModelSlug(slug)}
                      className={cn(
                        'pressable min-h-11 cursor-pointer rounded-xl border px-3 text-sm font-medium',
                        selected
                          ? 'border-ink-900 bg-ink-900 text-white'
                          : 'border-line bg-surface text-ink-700 hover:border-line-strong',
                      )}
                    >
                      {model?.name ?? slug}
                      <span
                        className={cn(
                          'mt-0.5 block text-[0.6875rem] font-normal',
                          selected ? 'text-white/70' : 'text-ink-300',
                        )}
                      >
                        {priceCredits(slug)} crédits
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="flex items-start gap-2 rounded-xl bg-sunken p-3 text-xs text-ink-500">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-ink-300" />
              Le visage sera cadré tête et épaules, de face, sur fond blanc uni — c’est ce qui le
              rend réutilisable dans vos scènes.
            </p>

            {error && <Alert tone="error">{error}</Alert>}

            {blocker && !error && <p className="text-xs text-ink-500">{blocker}</p>}

            <Button
              type="submit"
              variant="ember"
              className="w-full"
              loading={busy}
              disabled={Boolean(blocker)}
            >
              {busy ? 'Génération…' : `Générer — ${cost} crédits`}
            </Button>

            {insufficient && (
              <AppLink href="/wallet/topup" className={buttonStyles('secondary', 'sm', 'w-full')}>
                Recharger mon solde
              </AppLink>
            )}
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
