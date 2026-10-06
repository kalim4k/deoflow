/**
 * Les primitives de l'interface Deoflow, redessinées pour la vidéo.
 *
 * Chaque valeur vient d'une classe du site — `buttonStyles`, `Badge`, `Field`,
 * le `Segmented` de l'atelier, l'en-tête mobile de `AppShell`. Les commentaires
 * citent la classe d'origine : c'est ce qu'il faut relire quand le site change.
 */
// Import explicite : l'API `bundle()` de Remotion compile le JSX en mode classique.
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Img, staticFile } from 'remotion';
import { Icon, Spinner } from './icons';
import { fingerAt, type FingerKey } from './motion';
import { BODY, C, DISPLAY, SHADOW_CARD } from './theme';
import { HEADER_H } from './timeline';

/* ── Coquille ─────────────────────────────────────────────────────────── */

/** En-tête mobile : menu, logo, cloche, solde (`AppShell`, `< lg`). */
export function AppHeader({ credits, pulse = 0 }: { credits: number; pulse?: number }) {
  // `CreditPill` passe en alerte sous le seuil bas : c'est le cas à 0.
  const low = credits === 0;
  return (
    <div
      style={{
        position: 'absolute',
        inset: '0 0 auto 0',
        height: HEADER_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '0 16px',
        borderBottom: `1px solid ${C.line}`,
        background: 'rgba(255, 255, 255, 0.9)',
        zIndex: 5,
      }}
    >
      <div
        style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', color: C.ink700 }}
      >
        <Icon name="menu" size={20} />
      </div>
      <Logo size={30} text={16} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <div
          style={{ width: 34, height: 40, display: 'grid', placeItems: 'center', color: C.ink500 }}
        >
          <Icon name="bell" size={19} />
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 32,
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${low ? 'rgba(255, 90, 31, 0.3)' : C.line}`,
            background: low ? C.ember50 : C.surface,
            color: low ? C.ember700 : C.ink900,
            fontSize: 13,
            fontWeight: 500,
            transform: `scale(${1 + pulse * 0.08})`,
            boxShadow:
              pulse > 0 ? `0 0 0 ${pulse * 4}px rgba(255, 90, 31, ${pulse * 0.25})` : 'none',
          }}
        >
          <Icon name="coins" size={15} />
          <span style={{ fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums' }}>{credits}</span>
          <span style={{ color: low ? C.ember700 : C.ink500 }}>
            {credits > 1 ? 'crédits' : 'crédit'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Logo({ size = 36, text = 18 }: { size?: number; text?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28 }}>
      <Img src={staticFile('deoflow-icon.png')} style={{ width: size, height: size }} />
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: text,
          letterSpacing: '-0.02em',
          color: C.ink900,
        }}
      >
        Deoflow
      </span>
    </div>
  );
}

/**
 * Zone de contenu sous l'en-tête, avec son défilement. `px-4 pt-6` comme le
 * `<main>` de `AppShell`.
 */
export function Content({ scroll, children }: { scroll: number; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: HEADER_H,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ transform: `translateY(${-scroll}px)`, padding: '24px 16px 120px' }}>
        {children}
      </div>
    </div>
  );
}

/** Titre de page : `font-display text-[1.75rem]` + description `text-sm`. */
export function PageTitle({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ ...h, fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.025em' }}>{title}</h1>
        {description ? <p style={{ ...p, fontSize: 14, color: C.ink500 }}>{description}</p> : null}
      </div>
      {action ? <div style={{ display: 'flex' }}>{action}</div> : null}
    </div>
  );
}

export function BackLink({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.ink500 }}>
      <Icon name="arrowLeft" size={16} />
      {label}
    </div>
  );
}

/* ── Primitives ───────────────────────────────────────────────────────── */

export const h: CSSProperties = {
  margin: 0,
  fontFamily: DISPLAY,
  fontWeight: 700,
  color: C.ink900,
};
export const p: CSSProperties = { margin: 0, fontFamily: BODY, lineHeight: 1.55 };

/** `.card` : surface blanche, filet, rayon 16, ombre ténue. */
export function Card({
  children,
  padding = 20,
  style,
  glow = 0,
  borderColor = C.line,
}: {
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
  /** 0 → 1 : mise en avant animée (filet ember). */
  glow?: number;
  borderColor?: string;
}) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${glow > 0 ? mix(borderColor, C.ember500, glow) : borderColor}`,
        borderRadius: 16,
        boxShadow:
          glow > 0
            ? `${SHADOW_CARD}, 0 0 0 ${glow * 3}px rgba(255, 90, 31, ${glow * 0.18})`
            : SHADOW_CARD,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type Variant = 'primary' | 'ember' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: { background: C.ink900, color: '#fff', fontWeight: 500 },
  ember: { background: C.ember500, color: '#fff', fontWeight: 500 },
  secondary: {
    background: C.surface,
    color: C.ink900,
    fontWeight: 500,
    border: `1px solid ${C.line}`,
  },
  ghost: { background: 'transparent', color: C.ink500 },
};

const SIZES: Record<Size, CSSProperties> = {
  sm: { minHeight: 32, padding: '6px 12px', fontSize: 12, gap: 6, borderRadius: 8 },
  md: { minHeight: 44, padding: '10px 20px', fontSize: 14, gap: 8, borderRadius: 12 },
  lg: { minHeight: 52, padding: '14px 24px', fontSize: 16, gap: 10, borderRadius: 16 },
};

/** `buttonStyles(variant, size)`. `pressed` rejoue l'effet `.pressable`. */
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  full = false,
  pressed = 0,
  loading,
  style,
}: {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  full?: boolean;
  /** 0 → 1 : enfoncement au moment de la tape. */
  pressed?: number;
  /** Image courante quand le bouton tourne — affiche le spinner du site. */
  loading?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: full ? 'flex' : 'inline-flex',
        width: full ? '100%' : undefined,
        boxSizing: 'border-box',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
        fontFamily: BODY,
        border: '1px solid transparent',
        transform: `scale(${1 - pressed * 0.04})`,
        filter: pressed > 0 ? `brightness(${1 - pressed * 0.08})` : undefined,
        ...VARIANTS[variant],
        ...SIZES[size],
        ...style,
      }}
    >
      {loading !== undefined ? <Spinner frame={loading} size={16} /> : null}
      {children}
    </div>
  );
}

type Tone = 'neutral' | 'ink' | 'ember' | 'gain';
const TONES: Record<Tone, CSSProperties> = {
  neutral: { borderColor: C.line, background: C.sunken, color: C.ink500 },
  ink: { borderColor: C.ink900, background: C.ink900, color: '#fff' },
  ember: { borderColor: 'rgba(255, 90, 31, 0.25)', background: C.ember50, color: C.ember700 },
  gain: { borderColor: 'rgba(22, 163, 74, 0.25)', background: C.gain50, color: C.gain700 },
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 6,
        border: '1px solid',
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        ...TONES[tone],
      }}
    >
      {children}
    </span>
  );
}

/* ── Champs ───────────────────────────────────────────────────────────── */

/**
 * Champ de saisie du site (`Field.tsx`) : libellé, contrôle `rounded-xl` à
 * filet, indication en dessous. Le curseur clignote quand le champ a le focus.
 */
export function Field({
  label,
  required,
  aside,
  hint,
  value,
  placeholder,
  focused = false,
  frame,
  rows,
}: {
  label: string;
  required?: boolean;
  aside?: string;
  hint?: string;
  value: string;
  placeholder?: string;
  focused?: boolean;
  frame: number;
  /** Présent = zone de texte de cette hauteur en lignes. */
  rows?: number;
}) {
  const caretOn = focused && Math.floor(frame / 15) % 2 === 0;
  const empty = value.length === 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: C.ink700 }}>
          {label}
          {required ? <span style={{ color: C.ember600 }}> *</span> : null}
        </span>
        {aside ? <span style={{ fontSize: 12, color: C.ink300 }}>{aside}</span> : null}
      </div>
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${focused ? C.ink900 : C.line}`,
          background: C.surface,
          padding: '12px 16px',
          fontSize: 16,
          lineHeight: 1.5,
          color: empty ? C.ink300 : C.ink900,
          minHeight: rows ? rows * 24 : undefined,
          wordBreak: 'break-word',
        }}
      >
        {empty && !focused ? placeholder : value}
        <span
          style={{
            display: 'inline-block',
            width: 1.5,
            height: 19,
            marginLeft: 1,
            verticalAlign: 'text-bottom',
            background: caretOn ? C.ink900 : 'transparent',
          }}
        />
      </div>
      {hint ? (
        <p style={{ ...p, fontSize: 12, color: C.ink500, lineHeight: 1.45 }}>{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Le sélecteur à pastilles de l'atelier : fond `sunken`, option active en
 * `ink-900`. `active` peut être fractionnaire pendant un glissement.
 */
export function Segmented({
  label,
  options,
  active,
}: {
  label: string;
  options: { label: ReactNode; hint?: string }[];
  active: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: C.ink700 }}>{label}</span>
      <div
        style={{
          position: 'relative',
          display: 'grid',
          gridAutoFlow: 'column',
          gridAutoColumns: '1fr',
          gap: 4,
          padding: 4,
          borderRadius: 12,
          background: C.sunken,
        }}
      >
        {/* La pastille active glisse d'une option à l'autre. */}
        <div
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: `calc(4px + ${active} * ((100% - 8px - ${(options.length - 1) * 4}px) / ${options.length} + 4px))`,
            width: `calc((100% - 8px - ${(options.length - 1) * 4}px) / ${options.length})`,
            borderRadius: 8,
            background: C.ink900,
          }}
        />
        {options.map((option, i) => {
          const on = Math.round(active) === i;
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                minHeight: 44,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 8px',
                fontSize: 14,
                fontWeight: on ? 500 : 400,
                color: on ? '#fff' : C.ink500,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{option.label}</span>
              {option.hint ? (
                <span style={{ fontSize: 11, lineHeight: 1.2, opacity: 0.7 }}>{option.hint}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Le rectangle qui illustre un format (`RatioGlyph`). */
export function RatioGlyph({ ratio }: { ratio: string }) {
  const [w = 1, hh = 1] = ratio.split(':').map(Number);
  const s = 16 / Math.max(w, hh);
  return (
    <span
      style={{
        display: 'block',
        width: w * s,
        height: hh * s,
        borderRadius: 3,
        border: '1.5px solid currentColor',
        opacity: 0.7,
        boxSizing: 'border-box',
      }}
    />
  );
}

/* ── Doigt ────────────────────────────────────────────────────────────── */

/**
 * Le doigt du spectateur : un disque translucide qui se déplace, s'enfonce et
 * laisse une onde à chaque tape. Coordonnées en pixels de l'écran de l'app.
 */
export function Finger({ frame, keys }: { frame: number; keys: readonly FingerKey[] }) {
  const state = fingerAt(frame, keys);
  if (!state || state.opacity <= 0) return null;
  const { x, y, sinceTap, opacity } = state;

  const press = sinceTap < 10 ? Math.sin((sinceTap / 10) * Math.PI) : 0;
  const ripple = sinceTap < 16 ? sinceTap / 16 : null;

  return (
    <div
      style={{ position: 'absolute', left: x, top: y, zIndex: 50, opacity, pointerEvents: 'none' }}
    >
      {ripple !== null ? (
        <div
          style={{
            position: 'absolute',
            left: -22,
            top: -22,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: `2px solid ${C.ember500}`,
            transform: `scale(${0.5 + ripple * 1.1})`,
            opacity: 0.7 * (1 - ripple),
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: -14,
          top: -14,
          width: 28,
          height: 28,
          borderRadius: 999,
          background: 'rgba(11, 11, 12, 0.22)',
          border: '2px solid rgba(255, 255, 255, 0.95)',
          boxShadow: '0 3px 10px rgba(11, 11, 12, 0.28)',
          transform: `scale(${1 - press * 0.18})`,
        }}
      />
    </div>
  );
}

/* ── Utilitaires ──────────────────────────────────────────────────────── */

/** Mélange linéaire de deux couleurs `#rrggbb`. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (n: number, shift: number) => (n >> shift) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t));
  return `rgb(${out.join(',')})`;
}
