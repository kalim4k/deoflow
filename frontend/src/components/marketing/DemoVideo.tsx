'use client';

// Vidéo de démonstration de la page d'accueil, avec ses trois chapitres.
//
// Source : `demo-video/` (Remotion), à la racine du dépôt. Le fichier, ses
// dimensions et le début des chapitres arrivent par `demoVideo.ts`, GÉNÉRÉ au
// rendu — rien n'est recopié à la main ici, donc rien ne peut diverger.
//
// ⚠️ Le visiteur ne peut PAS la mettre en pause — décision du propriétaire,
// 2026-10-06. Ni bouton, ni clic sur l'image, ni menu contextuel, ni
// incrustation (qui a son propre bouton pause), ni diffusion vers un autre
// écran. Toute pause venue d'ailleurs est annulée sur-le-champ (`onPause`).
// Ce que ça coûte : le critère WCAG 2.2.2 (« Pause, arrêter, masquer ») n'est
// pas rempli pour un contenu animé qui démarre seul. D'où la règle qui reste :
// en « mouvement réduit », la vidéo ne démarre JAMAIS d'elle-même.
//
// Les seuls arrêts sont les nôtres, et ils sont invisibles :
//   - hors de l'écran, elle s'arrête (batterie) et reprend en revenant ;
//   - onglet masqué, idem.
//
// La cible charge cette page sur une 4G instable, souvent au forfait :
//   - `preload="none"` : pas un octet de vidéo tant qu'elle n'est pas lancée ;
//   - pas de lecture automatique en « économie de données » : l'affiche reste,
//     avec un bouton de lecture.
//
// Le bouton de lecture n'est donc pas une commande de pause déguisée : il
// n'apparaît que lorsque la vidéo ne tourne pas — préférence du visiteur, ou
// navigateur qui refuse la lecture automatique. Sans lui, ces visiteurs
// resteraient devant une image figée.
//
// Muette par construction (aucune piste son) : tout passe par les légendes
// incrustées. D'où l'absence de bouton de volume.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayIcon } from '@/components/icons';
import { DEMO_VIDEO } from '@/lib/deoflow/demoVideo';
import { cn } from '@/lib/cn';

/** Chapitre en cours pour une position de lecture donnée. */
function chapterAt(seconds: number): number {
  let current = 0;
  DEMO_VIDEO.chapters.forEach((chapter, i) => {
    if (seconds >= chapter.start) current = i;
  });
  return current;
}

/** Vrai quand le visiteur a demandé, d'une façon ou d'une autre, à ne pas être servi d'office. */
function prefersStill(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

export function DemoVideo({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** La vidéo est-elle à l'écran ? Hors de l'écran, l'arrêt est voulu. */
  const inView = useRef(false);
  /** Lecture lancée — d'office ou par le visiteur. Dès lors, elle ne s'arrête plus. */
  const started = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [chapter, setChapter] = useState(0);

  /** Relance la lecture, sauf si l'arrêt est l'un des nôtres. */
  const resume = useCallback(() => {
    const video = videoRef.current;
    if (!video || !started.current || !inView.current || document.hidden) return;
    // Un navigateur peut refuser la lecture automatique : l'affiche et le
    // bouton de lecture prennent le relais, rien à signaler.
    video.play().catch(() => {});
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    started.current = !prefersStill();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        inView.current = entry.isIntersecting;
        if (entry.isIntersecting) resume();
        else video.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(video);

    const onVisibility = () => resume();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [resume]);

  /** Lancement à la demande du visiteur, ou saut à un chapitre. */
  function start(at?: number) {
    const video = videoRef.current;
    if (!video) return;
    started.current = true;
    if (at !== undefined) video.currentTime = at;
    video.play().catch(() => {});
  }

  return (
    <figure className={cn('mx-auto w-full max-w-sm sm:max-w-md', className)}>
      <div className="card relative overflow-hidden p-0">
        <video
          ref={videoRef}
          // Les dimensions réservent la place avant le chargement : sans
          // elles, tout ce qui suit sauterait de 500 px à l'arrivée de la vidéo.
          width={DEMO_VIDEO.width}
          height={DEMO_VIDEO.height}
          poster={DEMO_VIDEO.poster}
          muted
          playsInline
          loop
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          // Le menu contextuel d'une vidéo propose « Pause » et « Afficher les
          // commandes » : deux portes dérobées vers ce qu'on a retiré.
          onContextMenu={(e) => e.preventDefault()}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            resume();
          }}
          onTimeUpdate={(e) => setChapter(chapterAt(e.currentTarget.currentTime))}
          aria-label="Démonstration de Deoflow : recharger en Mobile Money, créer un personnage, puis générer une vidéo avec lui."
          className="block h-auto w-full bg-sunken"
        >
          <source src={DEMO_VIDEO.src} type="video/mp4" />
        </video>

        {playing ? null : (
          <button
            type="button"
            onClick={() => start()}
            aria-label="Lire la démonstration"
            className="pressable absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-ink-900/85 text-white transition-colors duration-200 hover:bg-ink-900"
          >
            <PlayIcon className="size-7" />
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label="Chapitres de la démonstration"
        className="mt-3 flex flex-wrap justify-center gap-2"
      >
        {DEMO_VIDEO.chapters.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setChapter(i);
              start(c.start);
            }}
            aria-pressed={i === chapter}
            className={cn(
              'pressable min-h-10 cursor-pointer rounded-full border px-3.5 text-sm transition-colors duration-200',
              i === chapter
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-line bg-surface text-ink-700 hover:border-line-strong',
            )}
          >
            {i + 1}. {c.label}
          </button>
        ))}
      </div>

      {/* La page d'accueil a déjà été purgée d'aperçus simulés : dire d'où
          viennent les images montrées, c'est ce qui distingue une démonstration
          d'une promesse. */}
      <figcaption className="mt-3 text-center text-xs text-ink-300">
        Le personnage et le clip sont de vrais rendus Nano Banana 2 et Veo 3.1. Vidéo sans son.
      </figcaption>
    </figure>
  );
}
