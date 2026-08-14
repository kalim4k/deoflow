'use client';

// Zone de dépôt d'un emplacement de média, pilotée par le contrat d'entrée du
// modèle (`lib/deoflow/capabilities.ts`) : nombre de fichiers, poids, formats,
// bornes de durée et caractère obligatoire viennent tous de la spécification.
// Les cinq emplacements de Seedance et les deux de Kling partagent donc le
// même contrôle.
//
// Deux raisons de valider ici plutôt qu'au retour du serveur :
//   - refuser un fichier trop lourd sur le téléphone du créateur coûte zéro
//     octet de 4G, alors que le laisser partir coûte l'envoi complet ET un
//     échec côté fournisseur ;
//   - la durée mesurée d'une vidéo fixe le prix chez les modèles facturés à la
//     seconde. Sans elle, impossible d'annoncer un coût juste avant de lancer.

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { CloseIcon, PlayIcon, PlusIcon, UploadIcon } from '@/components/icons';
import { mediaOfMime, type MediaSlotSpec, type SlotMedia } from '@/lib/deoflow/capabilities';
import { cn } from '@/lib/cn';

export interface PickedFile {
  id: string;
  /**
   * `'local'` — fichier choisi par le créateur, encore à envoyer.
   * `'avatar'` — visage déjà hébergé chez nous : `url` est publique et
   *   directement lisible par le fournisseur, il n'y a rien à envoyer.
   */
  source: 'local' | 'avatar';
  /**
   * Aperçu. Pour une entrée locale c'est un `blob:` qui ne vaut que dans cet
   * onglet ; pour un avatar c'est l'URL Cloudinary définitive.
   */
  url: string;
  /**
   * Le fichier d'origine, conservé pour l'envoi vers le stockage. `null` pour
   * un avatar, dont l'image est déjà en ligne.
   */
  file: File | null;
  name: string;
  size: number;
  type: string;
  /** Mesurée pour une vidéo ou un son ; `null` pour une image. */
  durationSeconds: number | null;
}

/** Identifiant fixe de l'entrée d'avatar — au plus une par emplacement. */
export const AVATAR_ENTRY_ID = 'avatar-face';

/** Fichiers par clé d'emplacement — la forme attendue par le constructeur de requête. */
export type SlotFiles = Record<string, PickedFile[]>;

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} Mo` : `${Math.round(bytes / 1024)} Ko`;
}

export function formatSeconds(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded} s`;
  return `${Math.floor(rounded / 60)} min ${String(rounded % 60).padStart(2, '0')}`;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `f_${Math.random().toString(36).slice(2)}`;
}

/**
 * Durée réelle d'un média, lue dans ses métadonnées.
 *
 * Un élément hors document suffit : `preload="metadata"` ne télécharge que
 * l'en-tête, et l'URL est déjà locale. Renvoie `null` quand le navigateur
 * n'arrive pas à décoder le fichier — l'appelant décide alors s'il peut s'en
 * passer.
 */
function probeDuration(url: string, media: SlotMedia): Promise<number | null> {
  if (media === 'image') return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(media === 'video' ? 'video' : 'audio');
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      el.removeAttribute('src');
      resolve(value);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    // Un fichier corrompu peut ne déclencher ni l'un ni l'autre.
    window.setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

/**
 * État de tous les emplacements d'un modèle, dans un seul hook.
 *
 * Un hook par emplacement serait impossible : leur nombre change avec le mode,
 * et React interdit un compte de hooks variable. D'où le dictionnaire indexé
 * par clé d'API.
 *
 * Les object URLs sont libérés à chaque retrait ET au démontage : sur un
 * navigateur mobile, quelques essais avec des vidéos de 200 Mo suffisent à
 * faire gonfler la mémoire jusqu'au plantage de l'onglet.
 */
export function useMediaSlots() {
  const [bySlot, setBySlot] = useState<SlotFiles>({});
  const live = useRef<SlotFiles>({});

  useEffect(() => {
    live.current = bySlot;
  }, [bySlot]);

  useEffect(() => {
    return () => {
      for (const files of Object.values(live.current)) {
        // Seules les entrées locales portent un `blob:` à libérer.
        for (const file of files) {
          if (file.source === 'local') URL.revokeObjectURL(file.url);
        }
      }
    };
  }, []);

  /** Renvoie un message d'erreur, ou `null` si tout a été accepté. */
  const add = useCallback(async (spec: MediaSlotSpec, incoming: File[]): Promise<string | null> => {
    const current = live.current[spec.key] ?? [];
    const room = spec.maxCount - current.length;
    if (room <= 0) {
      return `Vous avez déjà atteint ${spec.maxCount} fichier${spec.maxCount > 1 ? 's' : ''}.`;
    }

    const accepted: PickedFile[] = [];
    let total = current.reduce((sum, f) => sum + (f.durationSeconds ?? 0), 0);

    for (const file of incoming.slice(0, room)) {
      if (spec.accept.length > 0 && !spec.accept.includes(file.type)) {
        return `« ${file.name} » n’est pas dans un format accepté.`;
      }
      if (file.size > spec.maxBytes) {
        return `« ${file.name} » pèse ${formatBytes(file.size)}, la limite est ${formatBytes(spec.maxBytes)}.`;
      }

      // La nature vient du FICHIER, pas de l'emplacement : `image_urls` chez
      // Gemini Omni accepte aussi des vidéos, qu'il faut mesurer pour facturer.
      const media = mediaOfMime(file.type);
      const url = URL.createObjectURL(file);
      const durationSeconds = await probeDuration(url, media);

      const reject = (reason: string): string => {
        URL.revokeObjectURL(url);
        for (const done of accepted) URL.revokeObjectURL(done.url);
        return reason;
      };

      if (media !== 'image' && durationSeconds === null) {
        // Sans durée lisible, un emplacement qui fixe le prix ne peut pas être
        // facturé honnêtement — mieux vaut refuser que deviner.
        if (spec.drivesDuration || spec.maxSeconds || spec.totalMaxSeconds) {
          return reject(`Impossible de lire la durée de « ${file.name} ».`);
        }
      }

      if (durationSeconds !== null) {
        if (spec.minSeconds !== undefined && durationSeconds < spec.minSeconds) {
          return reject(
            `« ${file.name} » dure ${formatSeconds(durationSeconds)}, le minimum est ${spec.minSeconds} s.`,
          );
        }
        if (spec.maxSeconds !== undefined && durationSeconds > spec.maxSeconds + 0.5) {
          return reject(
            `« ${file.name} » dure ${formatSeconds(durationSeconds)}, le maximum est ${spec.maxSeconds} s.`,
          );
        }
        if (spec.totalMaxSeconds !== undefined && total + durationSeconds > spec.totalMaxSeconds) {
          return reject(
            `Les fichiers dépasseraient ${spec.totalMaxSeconds} s au total (${formatSeconds(total + durationSeconds)}).`,
          );
        }
        total += durationSeconds;
      }

      accepted.push({
        id: newId(),
        source: 'local',
        url,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        durationSeconds,
      });
    }

    setBySlot((prev) => ({ ...prev, [spec.key]: [...(prev[spec.key] ?? []), ...accepted] }));
    return incoming.length > room ? `Seuls ${room} fichiers de plus étaient possibles.` : null;
  }, []);

  const remove = useCallback((slotKey: string, id: string) => {
    setBySlot((prev) => {
      const files = prev[slotKey] ?? [];
      const target = files.find((f) => f.id === id);
      // Un avatar n'a pas d'object URL à libérer : son image est hébergée.
      if (target?.source === 'local') URL.revokeObjectURL(target.url);
      return { ...prev, [slotKey]: files.filter((f) => f.id !== id) };
    });
  }, []);

  /**
   * Pose — ou retire — le visage de l'avatar sélectionné.
   *
   * Le visage occupe une VRAIE place dans l'emplacement, visible dans la zone
   * de dépôt. C'est délibéré : il consomme une des 3 places de Veo ou des 6 de
   * GPT Image. L'ajouter en douce au moment de l'envoi ferait échouer la
   * génération APRÈS débit, sur un « 3 images maximum » que le créateur
   * n'aurait pas vu venir.
   *
   * Toute entrée d'avatar des autres emplacements est retirée au passage :
   * changer de modèle déplace la cible, et deux visages dans deux emplacements
   * seraient tous les deux envoyés.
   */
  const setAvatarFace = useCallback(
    (slotKey: string | null, face: { url: string; name: string } | null) => {
      setBySlot((prev) => {
        const next: SlotFiles = {};
        for (const [key, files] of Object.entries(prev)) {
          next[key] = files.filter((f) => f.source !== 'avatar');
        }
        if (slotKey && face) {
          next[slotKey] = [
            {
              id: AVATAR_ENTRY_ID,
              source: 'avatar',
              url: face.url,
              file: null,
              name: face.name,
              size: 0,
              // Le portrait sort de kie.ai recopié vers Cloudinary : toujours
              // une image. La valeur sert à choisir la vignette.
              type: 'image/jpeg',
              durationSeconds: null,
            },
            ...(next[slotKey] ?? []),
          ];
        }
        return next;
      });
    },
    [],
  );

  /** Vide tout emplacement absent de `keep` — appelé au changement de mode. */
  const keepOnly = useCallback((keep: string[]) => {
    setBySlot((prev) => {
      const next: SlotFiles = {};
      let changed = false;
      for (const [key, files] of Object.entries(prev)) {
        if (keep.includes(key)) {
          next[key] = files;
          continue;
        }
        for (const file of files) {
          if (file.source === 'local') URL.revokeObjectURL(file.url);
        }
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  return { bySlot, add, remove, keepOnly, setAvatarFace };
}

/* ── Rendu ──────────────────────────────────────────────────────────────── */

function Thumbnail({ file }: { file: PickedFile }) {
  const media = mediaOfMime(file.type);
  if (media === 'image') {
    return <img src={file.url} alt={file.name} className="size-full object-cover" />;
  }
  if (media === 'video') {
    // `preload="metadata"` suffit à peindre la première image : inutile de
    // charger la vidéo entière pour une vignette.
    return (
      <video
        src={file.url}
        muted
        playsInline
        preload="metadata"
        className="size-full object-cover"
      />
    );
  }
  // Un son n'a rien à montrer : on affiche un contrôle de lecture réel.
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 text-ink-300">
      <PlayIcon className="size-5" />
      <audio src={file.url} controls className="w-full px-2" />
    </div>
  );
}

export function MediaDropzone({
  spec,
  files,
  onAdd,
  onRemove,
  busy,
}: {
  spec: MediaSlotSpec;
  files: PickedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  busy?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const full = files.length >= spec.maxCount;

  // Le libellé suit ce qui est réellement accepté : l'emplacement de Gemini
  // Omni s'appelle « image » mais prend aussi vidéos et sons.
  const kinds = new Set(spec.accept.map(mediaOfMime));
  const noun =
    kinds.size > 1
      ? 'vos fichiers'
      : kinds.has('video')
        ? 'une vidéo'
        : kinds.has('audio')
          ? 'un son'
          : 'une image';

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    onAdd(Array.from(e.dataTransfer.files));
  }

  const input = (
    <input
      type="file"
      accept={spec.accept.join(',')}
      multiple={spec.maxCount > 1}
      className="sr-only"
      onChange={(e) => {
        onAdd(Array.from(e.target.files ?? []));
        // Permet de resélectionner le même fichier après un retrait.
        e.target.value = '';
      }}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-ink-700">{spec.label}</span>
        <span
          className={cn(
            'text-xs',
            spec.requirement === 'required' ? 'font-medium text-ember-600' : 'text-ink-300',
          )}
        >
          {spec.requirement === 'required' ? 'obligatoire' : 'optionnel'}
        </span>
        {spec.maxCount > 1 && (
          <span className="ml-auto text-xs tabular-nums text-ink-300">
            {files.length} / {spec.maxCount}
          </span>
        )}
      </div>

      {files.length === 0 ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'pressable flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-7 text-center transition-colors duration-200',
            dragging
              ? 'border-ember-500 bg-ember-50'
              : 'border-line-strong bg-sunken hover:border-ink-300',
          )}
        >
          <UploadIcon className="size-5 text-ink-300" />
          <span className="text-sm text-ink-700">
            {busy ? (
              'Lecture du fichier…'
            ) : (
              <>
                Déposez {noun} ou <span className="underline underline-offset-2">parcourez</span>
              </>
            )}
          </span>
          <span className="text-xs text-ink-300">{spec.hint}</span>
          {input}
        </label>
      ) : (
        <>
          <ul
            className={cn(
              'grid gap-2',
              spec.maxCount > 1 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1',
            )}
          >
            {files.map((file) => (
              <li
                key={file.id}
                className={cn(
                  'relative overflow-hidden rounded-xl border border-line bg-sunken',
                  mediaOfMime(file.type) === 'audio' ? 'aspect-[2/1]' : 'aspect-video',
                )}
              >
                <Thumbnail file={file} />

                {/* Le visage d'un avatar occupe une place comme un fichier
                    déposé — c'est le but. Le signaler évite que le créateur
                    cherche pourquoi il ne peut plus en ajouter qu'une. */}
                {file.source === 'avatar' && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-ember-500 px-2 py-0.5 text-[0.625rem] font-medium text-white">
                    Avatar
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onRemove(file.id)}
                  aria-label={
                    file.source === 'avatar'
                      ? `Ne plus utiliser l’avatar ${file.name}`
                      : `Retirer ${file.name}`
                  }
                  className="pressable absolute right-1.5 top-1.5 grid size-7 cursor-pointer place-items-center rounded-full bg-ink-900/70 text-white backdrop-blur-sm transition-colors duration-200 hover:bg-ink-900"
                >
                  <CloseIcon className="size-3.5" />
                </button>

                {mediaOfMime(file.type) !== 'audio' && (
                  <span className="absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-2 bg-gradient-to-t from-ink-900/85 to-transparent px-2 pb-1.5 pt-5 text-[0.6875rem] text-white">
                    <span className="truncate">{file.name}</span>
                    {file.durationSeconds !== null && (
                      <span className="shrink-0 tabular-nums">
                        {formatSeconds(file.durationSeconds)}
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}

            {!full && (
              <li>
                <label className="pressable flex size-full min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong bg-sunken text-ink-300 transition-colors duration-200 hover:border-ink-300 hover:text-ink-500">
                  <PlusIcon className="size-4" />
                  <span className="text-xs">Ajouter</span>
                  {input}
                </label>
              </li>
            )}
          </ul>
          <p className="text-xs text-ink-300">{spec.hint}</p>
        </>
      )}
    </div>
  );
}
