/**
 * La vidéo de démonstration de la page d'accueil, de bout en bout.
 *
 * Muette par construction : sur la page d'accueil elle démarre seule, donc
 * sans le son. Tout ce qui doit être compris passe par les légendes du haut,
 * écrites pour être lues sur un téléphone.
 */
// Import explicite : l'API `bundle()` de Remotion compile le JSX en mode classique.
import React from 'react';
import type { ReactNode } from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import facts from './facts.json';
import { Icon } from './icons';
import { tween } from './motion';
import { PersonnageScreen, AVATAR_NAME } from './screens/Personnage';
import { PrincipeScreen } from './screens/Principe';
import { ClipPopOut, VideoScreen } from './screens/Video';
import { BODY, C } from './theme';
import { DEVICE, SCALE, STAGE_H, STAGE_W, T } from './timeline';
import { Button, Logo, h, p } from './ui';

const face = facts.faceModels[0]!;
const veo = facts.videoModels.find((m) => m.slug === 'veo-3-1')!;

const STEPS = ['Le principe', 'Le personnage', 'La vidéo'] as const;

/** Les légendes, dans l'ordre. Chacune reste affichée jusqu'à la suivante. */
const CAPTIONS: ReadonlyArray<{ from: number; step: 0 | 1 | 2; title: string; sub: string }> = [
  {
    from: T.ch1,
    step: 0,
    title: 'Rechargez en Mobile Money',
    sub: 'Sans carte bancaire. Vos crédits n’expirent pas.',
  },
  {
    from: T.ch1 + 200,
    step: 0,
    title: 'Créez images et vidéos',
    sub: 'Vous payez seulement ce que vous générez.',
  },
  {
    from: T.ch2,
    step: 1,
    title: 'Créez votre personnage',
    sub: 'Un nom, une description — écrits une seule fois.',
  },
  {
    from: T.ch2 + 222,
    step: 1,
    title: 'Générez son visage',
    sub: `${face.cost} crédits avec ${face.name}.`,
  },
  {
    from: T.ch2 + 345,
    step: 1,
    title: `${AVATAR_NAME} est prête`,
    sub: 'Son visage et sa description suivront chaque création.',
  },
  {
    from: T.ch3,
    step: 2,
    title: 'Générez votre vidéo',
    sub: 'Choisissez un modèle, puis votre personnage.',
  },
  {
    from: T.ch3 + 150,
    step: 2,
    title: 'Décrivez la scène',
    sub: 'En français, comme vous la voyez.',
  },
  {
    from: T.ch3 + 262,
    step: 2,
    title: 'Le prix, avant de lancer',
    sub: `${facts.veo.cost720} crédits pour ${facts.veo.seconds} secondes avec ${veo.name}.`,
  },
  {
    from: T.ch3 + 372,
    step: 2,
    title: 'Génération en cours',
    sub: `Environ ${Math.round(veo.etaSeconds / 60)} minutes — accéléré ici.`,
  },
  {
    from: T.ch3 + 440,
    step: 2,
    title: 'Téléchargez, publiez',
    sub: `Ce clip est un vrai rendu ${veo.name}, sans retouche.`,
  },
];

export function Demo() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: C.sunken }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${SCALE})`,
          transformOrigin: '0 0',
          overflow: 'hidden',
          fontFamily: BODY,
          color: C.ink900,
        }}
      >
        <Intro f={frame} />
        <Captions f={frame} />
        <Device f={frame} />
        <Sequence from={T.ch3} durationInFrames={T.outro - T.ch3}>
          <Local render={(f) => <ClipPopOut f={f} />} />
        </Sequence>
        <Outro f={frame} />
      </div>
    </AbsoluteFill>
  );
}

/** Donne l'image locale d'une `Sequence` à un rendu. */
function Local({ render }: { render: (f: number) => ReactNode }) {
  return <>{render(useCurrentFrame())}</>;
}

/* ── L'écran de l'app ─────────────────────────────────────────────────── */

function Device({ f }: { f: number }) {
  const { fps } = useVideoConfig();
  const rise = spring({ frame: f - 46, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const drop = tween(f, [T.outro, T.outro + 22], [0, 1], Easing.in(Easing.cubic));
  const offset = (1 - rise) * 420 + drop * 440;

  return (
    <div
      style={{
        position: 'absolute',
        left: DEVICE.x,
        top: DEVICE.y + offset,
        width: DEVICE.w,
        height: DEVICE.h,
        borderRadius: '24px 24px 0 0',
        overflow: 'hidden',
        background: C.canvas,
        border: `1px solid ${C.line}`,
        boxShadow: '0 30px 70px rgba(11, 11, 12, 0.12), 0 2px 8px rgba(11, 11, 12, 0.06)',
      }}
    >
      {f < T.ch1 ? <PrincipeScreen f={0} /> : null}
      <Sequence from={T.ch1} durationInFrames={T.ch2 - T.ch1}>
        <Local render={(local) => <PrincipeScreen f={local} />} />
      </Sequence>
      <Sequence from={T.ch2} durationInFrames={T.ch3 - T.ch2}>
        <Local render={(local) => <PersonnageScreen f={local} />} />
      </Sequence>
      <Sequence from={T.ch3}>
        <Local render={(local) => <VideoScreen f={local} />} />
      </Sequence>
    </div>
  );
}

/* ── Légendes ─────────────────────────────────────────────────────────── */

function Captions({ f }: { f: number }) {
  const shown =
    tween(f, [T.ch1 - 10, T.ch1 + 4], [0, 1]) * tween(f, [T.outro, T.outro + 10], [1, 0]);
  if (shown <= 0) return null;

  const index = CAPTIONS.findLastIndex((c) => f >= c.from);
  const current = CAPTIONS[Math.max(0, index)]!;
  const previous = index > 0 ? CAPTIONS[index - 1] : undefined;
  const t = tween(f, [current.from, current.from + 12], [0, 1]);
  const out = tween(f, [current.from, current.from + 7], [0, 1]);

  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        right: 24,
        top: 0,
        height: DEVICE.y,
        opacity: shown,
      }}
    >
      <StepChip step={current.step} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 54 }}>
        {previous && out < 1 ? (
          <CaptionText
            caption={previous}
            style={{ opacity: 1 - out, transform: `translateY(${-out * 8}px)` }}
          />
        ) : null}
        <CaptionText
          caption={current}
          style={{ opacity: t, transform: `translateY(${(1 - t) * 10}px)` }}
        />
      </div>
    </div>
  );
}

function CaptionText({
  caption,
  style,
}: {
  caption: (typeof CAPTIONS)[number];
  style: React.CSSProperties;
}) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, ...style }}>
      <h2 style={{ ...h, fontSize: 24, lineHeight: 1.12, letterSpacing: '-0.025em' }}>
        {caption.title}
      </h2>
      <p style={{ ...p, marginTop: 6, fontSize: 13.5, lineHeight: 1.45, color: C.ink500 }}>
        {caption.sub}
      </p>
    </div>
  );
}

function StepChip({ step }: { step: 0 | 1 | 2 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 24,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 24,
        padding: '0 10px 0 8px',
        borderRadius: 999,
        background: C.surface,
        border: `1px solid ${C.line}`,
        fontSize: 11.5,
        fontWeight: 500,
        color: C.ink500,
      }}
    >
      <span style={{ display: 'flex', gap: 3 }}>
        {STEPS.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === step ? 14 : 6,
              height: 6,
              borderRadius: 999,
              background: i <= step ? C.ember500 : C.line,
            }}
          />
        ))}
      </span>
      Étape {step + 1} sur 3 · {STEPS[step]}
    </div>
  );
}

/* ── Ouverture et fin ─────────────────────────────────────────────────── */

function Intro({ f }: { f: number }) {
  const { fps } = useVideoConfig();
  if (f > T.ch1 + 5) return null;
  const pop = spring({ frame: f - 4, fps, config: { damping: 12, stiffness: 140 } });
  const words = tween(f, [14, 26], [0, 1]);
  const leave = tween(f, [44, 62], [0, 1], Easing.in(Easing.cubic));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        paddingBottom: 30,
        opacity: 1 - leave,
        transform: `translateY(${-leave * 60}px)`,
      }}
    >
      <Img
        src={staticFile('deoflow-icon.png')}
        style={{ width: 72, height: 72, transform: `scale(${pop})` }}
      />
      <div
        style={{
          textAlign: 'center',
          opacity: words,
          transform: `translateY(${(1 - words) * 10}px)`,
        }}
      >
        <h1 style={{ ...h, fontSize: 32, letterSpacing: '-0.03em' }}>Comment ça marche</h1>
        <p style={{ ...p, marginTop: 6, fontSize: 15, color: C.ink500 }}>
          Trois étapes, depuis votre téléphone.
        </p>
      </div>
    </div>
  );
}

function Outro({ f }: { f: number }) {
  const { fps } = useVideoConfig();
  if (f < T.outro + 10) return null;
  const pop = spring({ frame: f - (T.outro + 14), fps, config: { damping: 13, stiffness: 130 } });
  const words = tween(f, [T.outro + 22, T.outro + 34], [0, 1]);
  const cta = tween(f, [T.outro + 32, T.outro + 44], [0, 1]);
  // Fondu final : la boucle repart d'une page vide, comme l'ouverture.
  const fade = tween(f, [T.end - 12, T.end - 1], [1, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: '0 32px',
        textAlign: 'center',
        opacity: fade,
      }}
    >
      <div style={{ transform: `scale(${pop})` }}>
        <Logo size={44} text={26} />
      </div>
      <div style={{ opacity: words, transform: `translateY(${(1 - words) * 10}px)` }}>
        <h1 style={{ ...h, fontSize: 31, lineHeight: 1.08, letterSpacing: '-0.03em' }}>
          Votre influenceuse IA,
          <br />
          générée ce soir.
        </h1>
        <p style={{ ...p, marginTop: 10, fontSize: 15, color: C.ink500 }}>
          Payable en Mobile Money, sans carte bancaire.
        </p>
      </div>
      <div style={{ opacity: cta, transform: `translateY(${(1 - cta) * 10}px)` }}>
        <Button size="lg">
          Créer mon compte
          <Icon name="arrowRight" size={16} />
        </Button>
      </div>
    </div>
  );
}
