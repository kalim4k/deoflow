'use client';

// Atelier de génération, partagé par /create/image et /create/video.
//
// L'écran ne connaît AUCUN modèle en particulier : il lit le contrat d'entrée
// dans `lib/deoflow/capabilities.ts` et se compose à partir de là. Kling
// affiche donc deux zones de dépôt et son réglage d'orientation, Seedance ses
// cinq emplacements répartis en trois modes, Nano Banana quatorze images —
// sans un seul `if (slug === …)`. C'est la seule façon d'éviter que six écrans
// divergent en silence à mesure que le catalogue bouge.
//
// Corollaire à tenir : tout réglage affiché ici doit exister chez le
// fournisseur, et tout ce qui est affiché comme coût doit être le coût réel.
// Un sélecteur fantôme ferait payer autre chose que ce qui est montré.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLink } from '@/components/NavProgress';
import { Button, buttonStyles } from '@/components/ui/Button';
import { TextareaField } from '@/components/ui/Field';
import { Alert, Badge, Card } from '@/components/ui/Feedback';
import {
  AVATAR_ENTRY_ID,
  MediaDropzone,
  formatSeconds,
  useMediaSlots,
} from '@/components/app/MediaDropzone';
import { AvatarPicker } from '@/components/app/AvatarPicker';
import { ModelBanner } from '@/components/app/ModelBanner';
import { DownloadIcon, PlayIcon, RefreshIcon, SparkIcon, SpinnerIcon } from '@/components/icons';
import { ApiError } from '@/lib/api';
import { useCreditsContext } from '@/contexts/CreditsContext';
import {
  startGeneration,
  uploadReference,
  waitForGeneration,
  type ApiAvatar,
  type ApiGeneration,
} from '@/lib/deoflow/api';
import { composePrompt, enrichesPrompt } from '@/lib/deoflow/avatarPrompt';
import { MODEL_TRAIT_LABELS } from '@/lib/deoflow/catalog';
import { priceCredits } from '@/lib/deoflow/pricing';
import { downloadUrl, generationFilename } from '@/lib/deoflow/download';
import {
  capabilitiesFor,
  characterRefFor,
  defaultParams,
  effectiveSlots,
  paramsFor,
  type ParamSpec,
  type ParamValues,
} from '@/lib/deoflow/capabilities';
import { isNarrow, needsTwoColumns } from '@/lib/deoflow/studioLayout';
import type { AiModel, MediaKind } from '@/lib/deoflow/types';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/cn';

/**
 * Choix exclusif rendu en une seule rangée.
 *
 * Les pastilles qui passaient à la ligne donnaient un écran haut et mou, où
 * l'œil ne voyait plus qu'une pile de boutons. Une piste à colonnes égales
 * (`auto-cols-fr`) tient sur une ligne quoi qu'il arrive, et la sélection se
 * lit d'un coup : un seul bloc sombre dans un rail clair.
 *
 * Contrepartie assumée : les libellés doivent rester courts. C'est pour ça que
 * les modes s'appellent « Texte », « Images clés », « Références » et non
 * « À partir d'un texte » — la phrase complète vit dans la description, juste
 * en dessous, où elle a la place de s'expliquer.
 */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode; hint?: string | undefined }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-ink-700">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-sunken p-1"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                // `min-h-11` : cible tactile de 44 px, la piste ne doit pas la
                // rogner sous prétexte de compacité.
                // `overflow-hidden` : dernier rempart. Une piste à colonnes
                // égales peut devenir plus étroite que son libellé ; le texte
                // doit alors être coupé net, jamais déborder sur la pastille
                // voisine.
                'pressable flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg px-2 py-1.5 text-sm transition-colors duration-200',
                active
                  ? 'bg-ink-900 font-medium text-white'
                  : 'text-ink-500 hover:bg-surface hover:text-ink-900',
              )}
            >
              {/* `w-full` est ce qui rend `truncate` opérant : dans une colonne
                  flex centrée, un enfant se dimensionne sur SON contenu et
                  déborde du bouton sans jamais rien avoir à couper. */}
              <span className="flex w-full min-w-0 items-center justify-center gap-1.5 truncate">
                {option.label}
              </span>
              {option.hint && (
                <span className="w-full truncate text-center text-[11px] leading-tight opacity-70">
                  {option.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Aperçu de la forme d'un format : lire « 9:16 » demande un effort, voir le
 *  rectangle n'en demande aucun. */
function RatioGlyph({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return null;
  const scale = 16 / Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      style={{ width: `${w * scale}px`, height: `${h * scale}px` }}
      className="block shrink-0 rounded-[3px] border-[1.5px] border-current opacity-70"
    />
  );
}

/**
 * Bande horizontale du composeur. Le titre est optionnel : quand la section ne
 * contient qu'un champ, c'est le <label> du champ qui fait office de titre —
 * même graisse, même taille, donc aucune rupture de rythme.
 */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line px-5 py-5 first:border-t-0">
      {title && <h2 className="text-sm font-medium text-ink-700">{title}</h2>}
      {children}
    </section>
  );
}

/** Rendu d'un paramètre déclaré par le modèle (orientation, son généré…). */
function ParamControl({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (spec.kind === 'toggle') {
    const on = value === true;
    return (
      <div className="flex items-start justify-between gap-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ink-700">{spec.label}</span>
          {spec.hint && <span className="text-xs text-ink-500">{spec.hint}</span>}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={spec.label}
          onClick={() => onChange(!on)}
          className={cn(
            'pressable relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
            on ? 'bg-ink-900' : 'bg-line-strong',
          )}
        >
          <span
            className={cn(
              'absolute top-1 size-5 rounded-full bg-surface transition-[left] duration-200',
              on ? 'left-6' : 'left-1',
            )}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Segmented
        label={spec.label}
        value={typeof value === 'string' ? value : spec.default}
        onChange={onChange}
        options={spec.options.map((option) => ({
          value: option.value,
          label: option.label,
          hint: option.hint,
        }))}
      />
      {spec.hint && <p className="text-xs text-ink-500">{spec.hint}</p>}
    </div>
  );
}

export function GenerationStudio({ kind, model }: { kind: MediaKind; model: AiModel }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { credits, refresh: refreshCredits } = useCreditsContext();

  const caps = capabilitiesFor(model.slug);
  const modes = useMemo(() => caps?.modes ?? [], [caps]);

  const [modeId, setModeId] = useState<string>(modes[0]?.id ?? 'text');
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];

  const [params, setParams] = useState<ParamValues>(() =>
    caps ? defaultParams(caps, modes[0]) : {},
  );
  const [prompt, setPrompt] = useState(searchParams.get('prompt') ?? '');
  const [ratio, setRatio] = useState<string>(model.ratios[0] ?? '9:16');
  const [running, setRunning] = useState(false);
  const [reading, setReading] = useState(false);
  const [stage, setStage] = useState<'idle' | 'upload' | 'run'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ApiGeneration | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Une clé par tentative : le serveur renvoie la génération déjà lancée si la
  // même clé revient, ce qui neutralise un double-clic sur un bouton facturé.
  const idempotencyKey = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `gen_${Math.random().toString(36).slice(2)}`,
  );

  const media = useMediaSlots();
  const { keepOnly, setAvatarFace } = media;
  const slots = useMemo(() => effectiveSlots(mode, params), [mode, params]);

  /* ── Avatar ───────────────────────────────────────────────────────── */

  const [avatar, setAvatar] = useState<ApiAvatar | null>(null);
  const characterRef = useMemo(() => characterRefFor(model.slug), [model.slug]);

  // Sélectionner un avatar bascule sur le mode qui sait recevoir un visage.
  // Sans ça, le choisir en mode Texte ne ferait rien de visible et le créateur
  // paierait une génération sans son personnage.
  useEffect(() => {
    if (avatar && characterRef) setModeId(characterRef.mode.id);
  }, [avatar, characterRef]);

  // Le visage occupe une VRAIE place dans l'emplacement — visible, et décompté
  // du maximum. Reposé à chaque changement de mode parce que `keepOnly` vide
  // les emplacements du mode précédent.
  useEffect(() => {
    const usable = avatar?.status === 'READY' && avatar.faceUrl && characterRef;
    const onRightMode = characterRef?.mode.id === mode?.id;
    setAvatarFace(
      usable && onRightMode ? (characterRef?.slot.key ?? null) : null,
      usable && onRightMode ? { url: avatar.faceUrl as string, name: avatar.name } : null,
    );
  }, [avatar, characterRef, mode, setAvatarFace]);

  // Changer de mode change les entrées attendues : on repart des paramètres
  // par défaut et on vide les emplacements que le nouveau mode n'utilise pas.
  // Sinon on enverrait une vidéo que le fournisseur ignore — et le créateur
  // croirait l'avoir utilisée.
  useEffect(() => {
    if (caps) setParams(defaultParams(caps, mode));
    keepOnly(mode?.slots.map((s) => s.key) ?? []);
  }, [caps, mode, keepOnly]);

  /* ── Durée et coût ────────────────────────────────────────────────── */

  const durationSpec = caps?.duration ?? { kind: 'none' as const };
  const [chosenDuration, setChosenDuration] = useState<number>(() =>
    durationSpec.kind === 'choice' || durationSpec.kind === 'range' ? durationSpec.default : 0,
  );

  // Un fichier déposé dans un emplacement « qui porte la durée » l'emporte sur
  // tout réglage : chez Kling c'est la règle du modèle, chez Gemini Omni une
  // vidéo en entrée rend le sélecteur de durée sans effet. Afficher malgré
  // tout des boutons ferait payer une durée que le fournisseur ignore.
  const measured: number | null = (() => {
    for (const slot of slots) {
      if (!slot.drivesDuration) continue;
      const timed = (media.bySlot[slot.key] ?? []).find((f) => f.durationSeconds !== null);
      if (timed) return timed.durationSeconds;
    }
    return null;
  })();

  /** `null` = pas encore connue (le fichier qui la porte manque). */
  const durationSeconds: number | null =
    measured !== null
      ? Math.ceil(measured)
      : durationSpec.kind === 'none'
        ? null
        : durationSpec.kind === 'fixed'
          ? durationSpec.seconds
          : durationSpec.kind === 'fromMedia'
            ? null
            : chosenDuration;

  // Une vidéo jointe change le mode de facturation du fournisseur, donc le
  // prix. On le reflète en direct pour que le montant affiché soit celui qui
  // sera débité — le serveur refait le même calcul depuis les URLs déposées,
  // et c'est lui qui fait foi.
  const videoJoined = slots.some((slot) =>
    // `f.type` et non `f.file.type` : une entrée d'avatar n'a pas de `File`,
    // son image étant déjà hébergée.
    (media.bySlot[slot.key] ?? []).some((f) => f.type.startsWith('video/')),
  );

  const cost =
    model.kind === 'video' && durationSeconds === null
      ? null
      : priceCredits(model.slug, {
          ...(durationSeconds !== null ? { seconds: durationSeconds } : {}),
          hasVideoInput: videoJoined,
          params,
        });

  const insufficient = cost !== null && cost > credits;
  const promptRequired = caps?.promptRequirement !== 'optional';
  const maxPrompt = Math.min(caps?.promptMaxLength ?? 2000, 2000);
  const modelParams = caps ? paramsFor(caps, mode) : [];

  /* ── Largeur des réglages courts ──────────────────────────────────── */

  // Nombre de pastilles de chaque réglage, dans l'ordre d'affichage ; `null`
  // pour un interrupteur, qui n'est pas une piste. La règle vit dans
  // `studioLayout.ts`, où un test la vérifie contre tout le catalogue.
  const durationChoices =
    durationSpec.kind === 'choice' && measured === null ? durationSpec.values.length : null;

  const shortControls: (number | null)[] = [
    ...(model.ratios.length > 0 ? [model.ratios.length] : []),
    ...modelParams.map((spec) => (spec.kind === 'choice' ? spec.options.length : null)),
    ...(durationChoices !== null ? [durationChoices] : []),
  ];

  const twoColumns = needsTwoColumns(shortControls);
  // `sm:col-span-2` UNIQUEMENT en grille à deux colonnes : sur une grille à une
  // colonne, franchir deux colonnes en crée une implicite et divise la largeur
  // par deux — l'inverse exact de l'effet recherché.
  const spanFull = twoColumns ? 'sm:col-span-2' : undefined;

  // Compteur de progression — purement indicatif, borné à l'estimation.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  /** Ce qui empêche de lancer, formulé pour être affiché tel quel. */
  const blocker: string | null = (() => {
    if (promptRequired && prompt.trim().length === 0) return 'Décrivez ce que vous voulez générer.';

    for (const slot of slots) {
      if (slot.requirement === 'required' && (media.bySlot[slot.key] ?? []).length === 0) {
        return `Ajoutez « ${slot.label} » — ce modèle ne peut pas s’en passer.`;
      }
    }
    if (mode?.requiresAnySlot && slots.every((s) => (media.bySlot[s.key] ?? []).length === 0)) {
      return 'Ajoutez au moins un fichier de référence.';
    }
    if (cost === null) return 'La durée dépendra du fichier que vous ajoutez.';
    if (insufficient) return `Il vous manque ${cost - credits} crédits.`;
    return null;
  })();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (blocker) {
      setError(blocker);
      return;
    }
    void run();
  }

  async function addTo(slotKey: string, files: File[]) {
    const spec = slots.find((s) => s.key === slotKey);
    if (!spec) return;
    setReading(true);
    setError(await media.add(spec, files));
    setReading(false);
  }

  async function run() {
    setError(null);
    setRunning(true);
    setElapsed(0);
    setResult(null);
    try {
      // 1. Les fichiers partent d'abord vers notre stockage : kie.ai télécharge
      //    les références depuis SES serveurs, un `blob:` local ne lui dit rien.
      setStage('upload');
      const uploaded: Record<string, string[]> = {};
      for (const slot of slots) {
        const files = media.bySlot[slot.key] ?? [];
        if (files.length === 0) continue;
        uploaded[slot.key] = await Promise.all(
          files.map((f) =>
            // Le visage d'un avatar est déjà chez nous : le renvoyer coûterait
            // un aller-retour de 4G pour aboutir à la même URL.
            f.source === 'avatar' || !f.file ? Promise.resolve(f.url) : uploadReference(f.file),
          ),
        );
      }

      // 2. Lancement. La clé d'idempotence rend un double-clic sans effet —
      //    sans elle, le second clic relancerait un appel facturé.
      setStage('run');
      const started = await startGeneration(
        {
          modelSlug: model.slug,
          prompt: prompt.trim(),
          ...(mode ? { mode: mode.id } : {}),
          ratio: model.ratios.length > 0 ? ratio : null,
          durationSeconds,
          params,
          media: uploaded,
          // Seul l'identifiant part : le serveur relit la description et l'URL
          // du visage en base, et recompose le prompt lui-même. Le navigateur
          // affiche le résultat, il ne le dicte pas.
          avatarId: avatar?.id ?? null,
        },
        idempotencyKey.current,
      );

      // 3. Sondage jusqu'à la fin. Le serveur recopie le résultat vers notre
      //    stockage au passage — les URLs du fournisseur expirent.
      const finished = await waitForGeneration(started.id);
      setResult(finished);

      if (finished.status === 'FAILED') {
        setError(
          finished.failureReason ?? 'La génération a échoué. Vos crédits vous ont été rendus.',
        );
      } else {
        toast('Génération terminée. Elle est enregistrée dans votre galerie.', 'success');
        // Une clé neuve : la prochaine génération est une nouvelle facture.
        idempotencyKey.current = crypto.randomUUID();
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      setError(
        code === 'INSUFFICIENT_CREDITS'
          ? 'Solde insuffisant. Rechargez pour lancer cette génération.'
          : err instanceof ApiError
            ? err.message
            : 'La génération a échoué. Aucun crédit n’a été débité.',
      );
    } finally {
      setStage('idle');
      // Le solde a bougé — débité, ou rendu si la tâche a échoué.
      void refreshCredits();
      setRunning(false);
    }
  }

  const remaining = Math.max(0, model.etaSeconds - elapsed);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
      {/* ── Composeur ──────────────────────────────────────────────── */}
      <Card className="p-0">
        <form onSubmit={onSubmit} className="flex flex-col">
          {/* Modèle retenu à l'étape précédente. Il reste visible pendant
              toute la saisie : c'est lui qui fixe le coût, les entrées
              attendues et les réglages proposés en dessous. */}
          <div className="flex items-center gap-3 px-5 pt-5">
            <ModelBanner model={model} className="aspect-auto size-11 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{model.name}</span>
                <Badge tone={model.trait === 'quality' ? 'ink' : 'neutral'}>
                  {MODEL_TRAIT_LABELS[model.trait]}
                </Badge>
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-300">{model.provider}</p>
            </div>
            <AppLink
              href={`/create/${kind}`}
              className="pressable shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-500 transition-colors duration-200 hover:bg-sunken hover:text-ink-900"
            >
              Changer
            </AppLink>
          </div>

          {/* Avatar — avant le mode : c'est lui qui décide du mode. */}
          {characterRef && (
            <Section title="Votre personnage">
              <AvatarPicker
                value={avatar}
                onChange={setAvatar}
                disabled={running}
                modelName={model.name}
              />
            </Section>
          )}

          {/* Mode d'entrée — n'apparaît que là où il y a vraiment un choix. */}
          {modes.length > 1 && mode && (
            <Section>
              <Segmented
                label="Point de départ"
                value={mode.id}
                onChange={setModeId}
                options={modes.map((m) => ({ value: m.id, label: m.label }))}
              />
              <p className="text-xs text-ink-500">{mode.description}</p>
            </Section>
          )}

          {/* Modèle à mode unique : on explique quand même ce qu'il attend. */}
          {modes.length === 1 && mode && mode.slots.length > 0 && (
            <Section title={mode.label}>
              <p className="text-xs text-ink-500">{mode.description}</p>
            </Section>
          )}

          {/* Emplacements de fichiers — un par entrée déclarée par le mode. */}
          {slots.length > 0 && (
            <Section title="Vos fichiers">
              <div className="flex flex-col gap-5">
                {slots.map((slot) => (
                  <MediaDropzone
                    key={slot.key}
                    spec={slot}
                    files={media.bySlot[slot.key] ?? []}
                    busy={reading}
                    onAdd={(files) => void addTo(slot.key, files)}
                    onRemove={(id) => {
                      // Retirer la vignette d'un avatar, c'est le désélectionner :
                      // le laisser coché tout en effaçant son visage donnerait
                      // une génération sans personnage, et un écran qui ment.
                      if (id === AVATAR_ENTRY_ID) setAvatar(null);
                      else media.remove(slot.key, id);
                    }}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section>
            <TextareaField
              label={promptRequired ? 'Votre description' : 'Votre description (optionnelle)'}
              aside={`${prompt.length} / ${maxPrompt}`}
              required={promptRequired}
              rows={4}
              maxLength={maxPrompt}
              placeholder={
                kind === 'video'
                  ? 'Décrivez le mouvement, le cadrage, l’ambiance…'
                  : 'Décrivez le personnage, la lumière, le décor…'
              }
              hint="Le français et l’anglais fonctionnent aussi bien."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            {/* Ce qui partira réellement.
                Un prompt qu'on ne voit pas est un prompt qu'on ne peut pas
                corriger quand le résultat déçoit — et le créateur a payé pour
                ce résultat. Affiché seulement quand l'avatar ajoute vraiment
                quelque chose, sinon c'est un doublon du champ ci-dessus. */}
            {avatar && enrichesPrompt(avatar) && (
              <div className="rounded-xl bg-sunken p-3">
                <p className="text-xs font-medium text-ink-500">
                  Envoyé au modèle, description de {avatar.name} comprise :
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-700">
                  {composePrompt(avatar, prompt.trim()) || '—'}
                </p>
              </div>
            )}
          </Section>

          {/* Durée — rendue selon la nature du réglage chez le fournisseur.
              Un bouton unique là où rien n'est réglable laisserait croire à un
              choix ; un curseur là où la durée est mesurée serait un mensonge. */}
          {durationSpec.kind === 'choice' && measured !== null && (
            <Section title="Durée">
              <p className="text-sm text-ink-500">
                {formatSeconds(measured)} — reprise de votre fichier. Avec une vidéo ou un son en
                entrée, le modèle fixe lui-même la longueur du rendu ; le réglage de durée est sans
                effet.
              </p>
            </Section>
          )}

          {/* Réglages courts : format, définition, durée. Empilés, ils
              donnaient un écran haut où plus rien ne ressortait ; côte à côte,
              tout le paramétrage tient dans un coup d'œil. Une colonne sur
              téléphone ; deux seulement quand deux réglages étroits peuvent
              s'apparier — voir `isNarrow`. */}
          {shortControls.length > 0 && (
            <Section>
              <div className={cn('grid gap-x-4 gap-y-5', twoColumns && 'sm:grid-cols-2')}>
                {model.ratios.length > 0 && (
                  <div className={isNarrow(model.ratios.length) ? undefined : spanFull}>
                    <Segmented
                      label="Format"
                      value={ratio}
                      onChange={setRatio}
                      options={model.ratios.map((r) => ({
                        value: r,
                        label: (
                          <>
                            <RatioGlyph ratio={r} />
                            {r}
                          </>
                        ),
                        // Le 9:16 est nommé parce que c'est celui que la cible
                        // publie — le reste se lit sur le rectangle.
                        hint: r === '9:16' ? 'TikTok' : undefined,
                      }))}
                    />
                  </div>
                )}

                {modelParams.map((spec) => (
                  <div
                    key={spec.key}
                    className={
                      isNarrow(spec.kind === 'choice' ? spec.options.length : null)
                        ? undefined
                        : spanFull
                    }
                  >
                    <ParamControl
                      spec={spec}
                      value={params[spec.key]}
                      onChange={(value) => setParams((prev) => ({ ...prev, [spec.key]: value }))}
                    />
                  </div>
                ))}

                {durationSpec.kind === 'choice' && measured === null && (
                  <div className={isNarrow(durationSpec.values.length) ? undefined : spanFull}>
                    <Segmented
                      label="Durée"
                      value={chosenDuration}
                      onChange={setChosenDuration}
                      options={durationSpec.values.map((d) => ({
                        value: d,
                        label: `${d} s`,
                        hint: `${priceCredits(model.slug, { seconds: d, hasVideoInput: videoJoined, params }) ?? 0} cr.`,
                      }))}
                    />
                  </div>
                )}
              </div>
            </Section>
          )}

          {durationSpec.kind === 'range' && (
            <Section>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="duration-range" className="text-sm font-medium text-ink-700">
                  Durée
                </label>
                <span className="font-display text-base tabular-nums">
                  {chosenDuration} s
                  <span className="ml-2 text-sm font-normal text-ink-500">
                    {priceCredits(model.slug, {
                      seconds: chosenDuration,
                      hasVideoInput: videoJoined,
                    }) ?? 0}{' '}
                    crédits
                  </span>
                </span>
              </div>
              <input
                id="duration-range"
                type="range"
                min={durationSpec.min}
                max={durationSpec.max}
                step={durationSpec.step}
                value={chosenDuration}
                onChange={(e) => setChosenDuration(Number(e.target.value))}
                className="h-11 w-full cursor-pointer accent-ink-900"
              />
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 30]
                  .filter((d) => d >= durationSpec.min && d <= durationSpec.max)
                  .map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setChosenDuration(d)}
                      className="pressable cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-500 transition-colors duration-200 hover:border-line-strong hover:text-ink-900"
                    >
                      {d} s
                    </button>
                  ))}
              </div>
            </Section>
          )}

          {durationSpec.kind === 'fixed' && (
            <Section title="Durée">
              <p className="text-sm text-ink-500">
                {durationSpec.seconds} secondes — longueur imposée par ce modèle.
              </p>
            </Section>
          )}

          {durationSpec.kind === 'fromMedia' && (
            <Section title="Durée">
              <p className="text-sm text-ink-500">
                {measured === null
                  ? 'Elle sera celle de votre vidéo de référence — ajoutez-la pour connaître le coût.'
                  : `${formatSeconds(measured)} — reprise de votre vidéo de référence, facturée ${durationSeconds} secondes.`}
              </p>
            </Section>
          )}

          {/* Récapitulatif avant lancement (F10 / F16) */}
          <div className="flex flex-col gap-3 border-t border-line px-5 py-5">
            <div className="flex flex-col gap-2 rounded-xl bg-sunken p-4">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-500">Coût de cette génération</span>
                <span className="font-display text-base">
                  {cost === null ? 'à déterminer' : `${cost} crédits`}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-500">Solde après</span>
                <span
                  className={cn('font-display', insufficient ? 'text-loss-600' : 'text-ink-900')}
                >
                  {cost === null
                    ? `${credits} crédits`
                    : insufficient
                      ? 'insuffisant'
                      : `${credits - cost} crédits`}
                </span>
              </div>
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            {insufficient && cost !== null ? (
              <AppLink href="/wallet/topup" className={buttonStyles('ember', 'md', 'w-full')}>
                Il vous manque {cost - credits} crédits — recharger
              </AppLink>
            ) : (
              <>
                <Button
                  type="submit"
                  variant="ember"
                  loading={running}
                  disabled={blocker !== null}
                  className="w-full"
                >
                  {running
                    ? 'Génération en cours…'
                    : cost === null
                      ? 'Générer'
                      : `Générer pour ${cost} crédits`}
                </Button>
                {blocker && !error && <p className="text-center text-xs text-ink-300">{blocker}</p>}
              </>
            )}
          </div>
        </form>
      </Card>

      {/* ── Résultat ───────────────────────────────────────────────── */}
      <Card className="flex min-h-[22rem] flex-col gap-4 lg:sticky lg:top-4">
        <h2 className="font-display text-lg">Résultat</h2>

        {running ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <SpinnerIcon className="size-8 text-ink-300" />
            <p className="text-sm text-ink-700">
              {stage === 'upload' ? 'Envoi de vos fichiers…' : 'Génération en cours…'}
            </p>
            <p className="text-xs text-ink-300">
              {stage === 'upload'
                ? 'Ils doivent être en ligne pour que le modèle puisse les lire.'
                : remaining > 0
                  ? `Encore ~${remaining} s`
                  : 'Bientôt terminé'}
            </p>
          </div>
        ) : result && result.status === 'SUCCEEDED' ? (
          <div className="flex flex-col gap-4">
            {result.urls.map((url) => (
              <div
                key={url}
                className="checkerboard overflow-hidden rounded-2xl border border-line"
              >
                {result.kind === 'video' ? (
                  <video src={url} controls playsInline className="mx-auto max-h-[26rem] w-auto" />
                ) : (
                  <img
                    src={url}
                    alt={result.prompt}
                    className="mx-auto max-h-[26rem] w-auto object-contain"
                  />
                )}
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <Badge tone="neutral">{result.modelName}</Badge>
              {result.ratio ? <Badge tone="neutral">{result.ratio}</Badge> : null}
              {result.durationSeconds ? (
                <Badge tone="neutral">{result.durationSeconds} s</Badge>
              ) : null}
              <span>{result.credits} crédits consommés</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {result.urls[0] && (
                <a
                  href={downloadUrl(
                    result.urls[0],
                    generationFilename(result.modelSlug, result.id),
                  )}
                  download
                  className={buttonStyles('primary', 'md')}
                >
                  <DownloadIcon className="size-4" />
                  Télécharger
                </a>
              )}
              <Button variant="secondary" onClick={() => void run()} disabled={blocker !== null}>
                <RefreshIcon className="size-4" />
                Relancer
              </Button>
              <Button variant="ghost" onClick={() => router.push(`/gallery/${result.id}`)}>
                Voir dans la galerie
              </Button>
            </div>
          </div>
        ) : result && result.status === 'FAILED' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Alert tone="error">
              {result.failureReason ?? 'La génération a échoué.'}
              <br />
              Vos {result.credits} crédits vous ont été rendus.
            </Alert>
            <Button variant="secondary" onClick={() => void run()} disabled={blocker !== null}>
              <RefreshIcon className="size-4" />
              Réessayer
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-ink-300">
            {kind === 'video' ? <PlayIcon className="size-8" /> : <SparkIcon className="size-8" />}
            <p className="max-w-xs text-sm">
              {slots.some((s) => s.requirement === 'required')
                ? 'Ajoutez vos fichiers et votre description, le résultat s’affichera ici.'
                : 'Écrivez votre description, et le résultat s’affichera ici.'}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
