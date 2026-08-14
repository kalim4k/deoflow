'use client';

// Les avatars du créateur — sa troupe de personnages.
//
// C'est la SEULE page où ils apparaissent : un visage d'avatar est du matériel
// de travail, pas une création publiable, et il n'a rien à faire dans la
// galerie. Le filtre est posé côté route (`purpose: 'CREATION'`), pas ici.
//
// Un avatar dont le visage se génère encore reste affiché, marqué « en cours ».
// Le masquer donnerait l'impression que la création a échoué.

import { useEffect, useState } from 'react';
import { AppLink } from '@/components/NavProgress';
import { AppShell } from '@/components/app/AppShell';
import { buttonStyles } from '@/components/ui/Button';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { PlusIcon, SpinnerIcon, UserIcon } from '@/components/icons';
import { listAvatars, type ApiAvatar } from '@/lib/deoflow/api';
import { errorMessage } from '@/lib/errorMessages';
import { cn } from '@/lib/cn';

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<ApiAvatar[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Un avatar en cours de génération se résout côté serveur à la lecture : on
  // rappelle la liste tant qu'il en reste un, plutôt que de laisser le créateur
  // rafraîchir à la main.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function load() {
      try {
        const items = await listAvatars();
        if (cancelled) return;
        setAvatars(items);
        if (items.some((a) => a.status === 'PENDING')) {
          timer = window.setTimeout(() => void load(), 4000);
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err));
          setAvatars([]);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <AppShell
      title="Personnages"
      description="Vos influenceurs — un visage et une description, réutilisables dans chaque génération."
      actions={
        <AppLink href="/avatars/new" className={buttonStyles('ember', 'md')}>
          <PlusIcon className="size-4" />
          Nouvel avatar
        </AppLink>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert tone="error">{error}</Alert>}

        {avatars === null ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="card overflow-hidden">
                <div className="aspect-square animate-pulse bg-sunken" />
                <div className="p-3">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-sunken" />
                </div>
              </li>
            ))}
          </ul>
        ) : avatars.length === 0 ? (
          <EmptyState
            icon={<UserIcon className="size-8" />}
            title="Aucun personnage"
            description="Créez votre influenceur une fois : son visage et sa description seront joints automatiquement à chacune de vos générations, image comme vidéo."
            action={
              <AppLink href="/avatars/new" className={buttonStyles('ember', 'sm')}>
                Créer mon premier avatar
              </AppLink>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {avatars.map((avatar) => (
              <li key={avatar.id}>
                <AppLink
                  href={`/avatars/${avatar.id}`}
                  className="pressable card block cursor-pointer overflow-hidden"
                >
                  <div className="checkerboard relative aspect-square bg-sunken">
                    {avatar.faceUrl ? (
                      <img
                        src={avatar.faceUrl}
                        alt={avatar.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-ink-300">
                        {avatar.status === 'PENDING' ? (
                          <SpinnerIcon className="size-7" />
                        ) : (
                          <UserIcon className="size-7" />
                        )}
                      </div>
                    )}

                    {avatar.status !== 'READY' && (
                      <span className="absolute left-2 top-2">
                        <Badge tone={avatar.status === 'PENDING' ? 'neutral' : 'loss'}>
                          {avatar.status === 'PENDING' ? 'En cours…' : 'Échec'}
                        </Badge>
                      </span>
                    )}
                  </div>

                  <div className="p-3">
                    <p className="truncate font-display text-sm">{avatar.name}</p>
                    <p
                      className={cn(
                        'mt-0.5 truncate text-xs',
                        avatar.description ? 'text-ink-500' : 'text-ink-300',
                      )}
                    >
                      {avatar.description || 'Sans description'}
                    </p>
                  </div>
                </AppLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
