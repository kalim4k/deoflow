'use client';

// Sélecteur d'avatar dans l'atelier de génération.
//
// Le choix se fait sur les visages, pas sur des noms dans une liste
// déroulante : c'est une ressemblance qu'on cherche, et un créateur reconnaît
// son personnage plus vite qu'il ne lit « Awa ».
//
// Ne s'affiche que sur les modèles qui savent recevoir une référence de
// personnage — l'atelier ne monte ce composant que si `characterRefFor()`
// répond.

import { useEffect, useState } from 'react';
import { AppLink } from '@/components/NavProgress';
import { buttonStyles } from '@/components/ui/Button';
import { PlusIcon, SpinnerIcon, UserIcon } from '@/components/icons';
import { listAvatars, type ApiAvatar } from '@/lib/deoflow/api';
import { cn } from '@/lib/cn';

export function AvatarPicker({
  value,
  onChange,
  disabled,
  modelName,
}: {
  value: ApiAvatar | null;
  onChange: (avatar: ApiAvatar | null) => void;
  disabled?: boolean;
  modelName: string;
}) {
  const [avatars, setAvatars] = useState<ApiAvatar[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAvatars()
      .then((items) => {
        if (!cancelled) setAvatars(items);
      })
      // Un échec de chargement ne doit pas bloquer une génération sans avatar :
      // on retombe sur « aucun personnage », qui est le cas courant.
      .catch(() => {
        if (!cancelled) setAvatars([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (avatars === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-300">
        <SpinnerIcon className="size-4" />
        Chargement de vos personnages…
      </div>
    );
  }

  // Seuls les avatars dont le visage est prêt sont proposés : en sélectionner
  // un en cours de génération ferait échouer la requête après débit.
  const usable = avatars.filter((a) => a.status === 'READY' && a.faceUrl);

  if (usable.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2.5 rounded-xl bg-sunken p-4">
        <p className="text-sm text-ink-700">
          Créez un influenceur une fois, et retrouvez le même visage dans toutes vos générations.
        </p>
        <AppLink href="/avatars/new" className={buttonStyles('secondary', 'sm')}>
          <PlusIcon className="size-4" />
          Créer un personnage
        </AppLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-wrap gap-2.5">
        {/* « Aucun » est une vignette comme les autres : c'est un choix, pas
            l'absence de choix, et il doit se reprendre d'un clic. */}
        <li>
          <PickerTile
            selected={value === null}
            disabled={disabled}
            label="Aucun"
            onClick={() => onChange(null)}
          >
            <UserIcon className="size-5 text-ink-300" />
          </PickerTile>
        </li>

        {usable.map((avatar) => (
          <li key={avatar.id}>
            <PickerTile
              selected={value?.id === avatar.id}
              disabled={disabled}
              label={avatar.name}
              onClick={() => onChange(value?.id === avatar.id ? null : avatar)}
            >
              {/* `img` et non `next/image` : l'URL Cloudinary est déjà
                  dimensionnée, et la vignette fait 56 px. */}
              <img
                src={avatar.faceUrl as string}
                alt=""
                className="size-full rounded-[inherit] object-cover"
              />
            </PickerTile>
          </li>
        ))}

        <li className="self-center">
          <AppLink
            href="/avatars/new"
            className="pressable inline-flex min-h-14 cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 text-xs text-ink-500 hover:border-ink-300 hover:text-ink-900"
          >
            <PlusIcon className="size-4" />
            Nouveau
          </AppLink>
        </li>
      </ul>

      {value && (
        <p className="text-xs text-ink-500">
          Le visage de {value.name} et sa description seront joints automatiquement.{' '}
          {/* Dire la limite ici, une fois, plutôt que de laisser le créateur
              conclure à un bug après trois générations un peu différentes. */}
          <span className="text-ink-300">
            {modelName} garde une forte ressemblance, pas un visage identique au pixel près.
          </span>
        </p>
      )}
    </div>
  );
}

function PickerTile({
  selected,
  disabled,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  // `| undefined` explicite : sous `exactOptionalPropertyTypes`, un champ
  // simplement optionnel refuse la valeur `undefined` qu'un parent transmet.
  disabled?: boolean | undefined;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={label}
      className={cn(
        'pressable flex w-16 cursor-pointer flex-col items-center gap-1',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      <span
        className={cn(
          'grid size-14 place-items-center overflow-hidden rounded-xl border-2 bg-sunken transition-colors duration-200',
          selected ? 'border-ember-500' : 'border-transparent hover:border-line-strong',
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          'w-full truncate text-center text-[0.6875rem]',
          selected ? 'font-medium text-ink-900' : 'text-ink-500',
        )}
      >
        {label}
      </span>
    </button>
  );
}
