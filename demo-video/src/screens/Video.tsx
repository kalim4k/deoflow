/**
 * Chapitre 3 — générer une vidéo : choix du modèle, atelier, prix affiché
 * avant de lancer, puis le résultat.
 *
 * Écrans reproduits : `/create/video` (sélection du modèle) puis l'atelier
 * (`GenerationStudio`). Le clip qui sort de l'écran est le vrai rendu Veo 3.1
 * obtenu avec le visage d'Awa en référence et la scène tapée ici — voir
 * `public/provenance.json`.
 */
// Import explicite : l'API `bundle()` de Remotion compile le JSX en mode classique.
import React from 'react';
import { Img, OffthreadVideo, Sequence, staticFile } from 'remotion';
import facts from '../facts.json';
import { Icon, Spinner } from '../icons';
import { counter, pageIn, steps, tween, typed } from '../motion';
import { C, DISPLAY } from '../theme';
import { DEVICE } from '../timeline';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  Content,
  Field,
  Finger,
  PageTitle,
  RatioGlyph,
  Segmented,
  h,
  p,
} from '../ui';
import { AVATAR_DESCRIPTION, AVATAR_NAME } from './Personnage';
import { press } from './Principe';

/** La scène tapée — mot pour mot celle envoyée à Veo pour produire le clip. */
export const SCENE =
  'Elle marche dans un marché coloré de Lomé, sourit et salue la caméra, lumière dorée de fin d’après-midi.';

const veoModel = facts.videoModels.find((m) => m.slug === 'veo-3-1')!;
const second = facts.videoModels.find((m) => m.slug === 'kling-2-6')!;
const before = facts.starterPack.credits - facts.faceModels[0]!.cost;
const cost = facts.veo.cost720;
const SCENE_CPS = 1.15;

export const V = {
  scrollPicker: 18,
  tapModel: 46,
  studio: 54,
  scrollAvatar: 66,
  tapAvatar: 96,
  scrollPrompt: 122,
  tapPrompt: 152,
  typePrompt: 156,
  scrollControls: 262,
  ringRatio: 290,
  scrollRecap: 330,
  glowCost: 340,
  tapGenerate: 372,
  scrollResult: 382,
  done: 440,
  popOut: 452,
  popBack: 545,
  scrollActions: 548,
  tapDownload: 566,
  end: 580,
} as const;

export function VideoScreen({ f }: { f: number }) {
  const credits =
    f < V.tapGenerate + 2 ? before : counter(f, V.tapGenerate + 2, 16, before, before - cost);
  const pulse =
    tween(f, [V.tapGenerate + 2, V.tapGenerate + 8], [0, 1]) *
    tween(f, [V.tapGenerate + 18, V.tapGenerate + 30], [1, 0]);

  return (
    <>
      <AppHeader credits={credits} pulse={pulse} />
      {f < V.studio ? <Picker f={f} /> : <Studio f={f} />}
      <Finger
        frame={f}
        keys={[
          { at: 34, x: 200, y: 250 },
          { at: V.tapModel, x: 95, y: 261, tap: true },
          { at: V.tapAvatar, x: 145, y: 280, tap: true },
          { at: V.tapAvatar + 16, x: 250, y: 320 },
          { at: V.tapPrompt, x: 178, y: 160, tap: true },
          { at: V.tapPrompt + 16, x: 300, y: 330 },
          { at: V.tapGenerate, x: 178, y: 167, tap: true },
          { at: V.tapGenerate + 16, x: 260, y: 320 },
        ]}
      />
      <Finger
        frame={f}
        keys={[
          { at: 554, x: 220, y: 330 },
          { at: V.tapDownload, x: 106, y: 250, tap: true },
        ]}
      />
    </>
  );
}

/* ── Choix du modèle ──────────────────────────────────────────────────── */

function Picker({ f }: { f: number }) {
  const scroll = steps(
    f,
    [
      [0, 0],
      [V.scrollPicker, 330],
    ],
    24,
  );
  return (
    <div style={{ position: 'absolute', inset: 0, ...pageIn(f, 0) }}>
      <Content scroll={scroll}>
        <PageTitle
          title="Choisir un modèle vidéo"
          description="Les modèles vidéo facturent à la seconde. Sélectionnez-en un pour commencer."
          action={
            <Button variant="secondary">
              <Icon name="image" size={16} />
              Passer à l’image
            </Button>
          }
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ModelCard model={veoModel} image="veo-3-1-card.webp" pressed={press(f, V.tapModel)} />
          <ModelCard model={second} image="kling-2-6-card.webp" pressed={0} />
        </div>
      </Content>
    </div>
  );
}

function ModelCard({
  model,
  image,
  pressed,
}: {
  model: typeof veoModel;
  image: string;
  pressed: number;
}) {
  return (
    <Card padding={0} style={{ overflow: 'hidden', transform: `scale(${1 - pressed * 0.02})` }}>
      <Img
        src={staticFile(image)}
        style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div>
            <h3 style={{ ...h, fontSize: 16 }}>{model.name}</h3>
            <p style={{ ...p, fontSize: 12, color: C.ink300 }}>{model.provider}</p>
          </div>
          <Badge tone={model.trait === 'quality' ? 'ink' : 'neutral'}>{model.traitLabel}</Badge>
        </div>
        <p style={{ ...p, fontSize: 14, color: C.ink500 }}>{model.tagline}</p>
        <p style={{ ...p, fontSize: 12, color: C.ink300 }}>{model.inputSummary}</p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 12px',
            fontSize: 14,
          }}
        >
          <span style={{ fontWeight: 500, color: C.ink900 }}>
            {model.startingPrice} crédits
            <span style={{ fontWeight: 400, color: C.ink500 }}>
              {' '}
              à partir de {model.shortest} s
            </span>
          </span>
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.ink300 }}
          >
            <Icon name="clock" size={14} />~{model.etaSeconds} s
          </span>
        </div>
        <span
          style={{
            marginTop: 4,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 14,
            fontWeight: 500,
            color: C.ember600,
          }}
        >
          Choisir ce modèle
          <Icon name="arrowRight" size={16} />
        </span>
      </div>
    </Card>
  );
}

/* ── Atelier ──────────────────────────────────────────────────────────── */

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderTop: `1px solid ${C.line}`,
        padding: 20,
      }}
    >
      {title ? (
        <h2 style={{ ...p, fontSize: 14, fontWeight: 500, color: C.ink700 }}>{title}</h2>
      ) : null}
      {children}
    </div>
  );
}

function Studio({ f }: { f: number }) {
  const scroll = steps(
    f,
    [
      [0, 0],
      [V.scrollAvatar, 170],
      [V.scrollPrompt, 950],
      [V.scrollControls, 1280],
      [V.scrollRecap, 1687],
      [V.scrollResult, 1932],
      [V.scrollActions, 2252],
    ],
    24,
  );

  const avatar = f >= V.tapAvatar;
  const mode = avatar ? tween(f, [V.tapAvatar + 4, V.tapAvatar + 14], [0, 2]) : 0;
  const scene = typed(SCENE, f, V.typePrompt, SCENE_CPS);
  const composed = scene.length > 0 ? `${AVATAR_DESCRIPTION}. ${scene}` : AVATAR_DESCRIPTION;
  const running = f >= V.tapGenerate + 3 && f < V.done;
  const succeeded = f >= V.done;
  const ring =
    tween(f, [V.ringRatio, V.ringRatio + 8], [0, 1]) *
    tween(f, [V.ringRatio + 24, V.ringRatio + 34], [1, 0]);
  const glowCost =
    tween(f, [V.glowCost, V.glowCost + 8], [0, 1]) *
    tween(f, [V.glowCost + 24, V.glowCost + 34], [1, 0]);
  const remaining = Math.max(
    0,
    Math.round(tween(f, [V.tapGenerate, V.done - 12], [veoModel.etaSeconds - 2, 0])),
  );

  return (
    <div style={{ position: 'absolute', inset: 0, ...pageIn(f, V.studio) }}>
      <Content scroll={scroll}>
        <PageTitle
          title="Générer une vidéo"
          description="Le coût suit la durée choisie : il se recalcule à chaque changement."
          action={
            <Button variant="secondary">
              <Icon name="image" size={16} />
              Passer à l’image
            </Button>
          }
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card padding={0}>
            {/* Modèle retenu */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 20px 20px' }}
            >
              <Img
                src={staticFile('veo-3-1-card.webp')}
                style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    ...p,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {veoModel.name}
                  <Badge tone="ink">{veoModel.traitLabel}</Badge>
                </p>
                <p style={{ ...p, marginTop: 2, fontSize: 12, color: C.ink300 }}>
                  {veoModel.provider}
                </p>
              </div>
              <span style={{ padding: '6px 10px', fontSize: 12, fontWeight: 500, color: C.ink500 }}>
                Changer
              </span>
            </div>

            <Section title="Votre personnage">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Tile label="Aucun" selected={!avatar}>
                  <Icon name="user" size={20} color={C.ink300} />
                </Tile>
                <Tile label={AVATAR_NAME} selected={avatar} pressed={press(f, V.tapAvatar)}>
                  <Img
                    src={staticFile('awa.jpg')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Tile>
                <div
                  style={{
                    alignSelf: 'center',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 56,
                    padding: '0 12px',
                    borderRadius: 12,
                    border: `1px dashed ${C.lineStrong}`,
                    fontSize: 12,
                    color: C.ink500,
                  }}
                >
                  <Icon name="plus" size={16} />
                  Nouveau
                </div>
              </div>
              {avatar ? (
                <p
                  style={{
                    ...p,
                    fontSize: 12,
                    color: C.ink500,
                    opacity: tween(f, [V.tapAvatar, V.tapAvatar + 8], [0, 1]),
                  }}
                >
                  Le visage de {AVATAR_NAME} et sa description seront joints automatiquement.{' '}
                  <span style={{ color: C.ink300 }}>
                    {veoModel.name} garde une forte ressemblance, pas un visage identique au pixel
                    près.
                  </span>
                </p>
              ) : null}
            </Section>

            <Section>
              <Segmented
                label="Point de départ"
                active={mode}
                options={[{ label: 'Texte' }, { label: 'Images clés' }, { label: 'Références' }]}
              />
              <p style={{ ...p, fontSize: 12, color: C.ink500 }}>
                {avatar
                  ? 'Jusqu’à trois images dont le modèle reprend les éléments — un personnage, un décor, un objet — sans en faire des images du film.'
                  : 'Décrivez la scène et le mouvement de caméra, le modèle filme.'}
              </p>
            </Section>

            {avatar ? (
              <Section title="Vos fichiers">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.ink700 }}>
                      Images de référence
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: C.ink300 }}>1 / 3</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div
                      style={{
                        position: 'relative',
                        aspectRatio: '16 / 9',
                        overflow: 'hidden',
                        borderRadius: 12,
                        border: `1px solid ${C.line}`,
                        background: C.sunken,
                      }}
                    >
                      <Img
                        src={staticFile('awa.jpg')}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          left: 6,
                          top: 6,
                          borderRadius: 999,
                          background: C.ember500,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 500,
                          color: '#fff',
                        }}
                      >
                        Avatar
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        minHeight: 80,
                        borderRadius: 12,
                        border: `1px dashed ${C.lineStrong}`,
                        background: C.sunken,
                        color: C.ink300,
                      }}
                    >
                      <Icon name="plus" size={16} />
                      <span style={{ fontSize: 12 }}>Ajouter</span>
                    </div>
                  </div>
                  <p style={{ ...p, fontSize: 12, color: C.ink300 }}>
                    JPG, PNG ou WEBP — 3 images maximum, 10 Mo chacune.
                  </p>
                </div>
              </Section>
            ) : null}

            <Section>
              <Field
                label="Votre description"
                aside={`${Array.from(scene).length} / 2000`}
                rows={4}
                placeholder="Décrivez le mouvement, le cadrage, l’ambiance…"
                hint="Le français et l’anglais fonctionnent aussi bien."
                value={scene}
                focused={f >= V.tapPrompt && f < V.scrollControls}
                frame={f}
              />
              {avatar ? (
                <div style={{ borderRadius: 12, background: C.sunken, padding: 12 }}>
                  <p style={{ ...p, fontSize: 12, fontWeight: 500, color: C.ink500 }}>
                    Envoyé au modèle, description de {AVATAR_NAME} comprise :
                  </p>
                  <p style={{ ...p, marginTop: 6, fontSize: 12, lineHeight: 1.6, color: C.ink700 }}>
                    {composed}
                  </p>
                </div>
              ) : null}
            </Section>

            <Section>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div
                  style={{
                    borderRadius: 14,
                    boxShadow:
                      ring > 0 ? `0 0 0 ${ring * 3}px rgba(255, 90, 31, ${ring * 0.35})` : 'none',
                  }}
                >
                  <Segmented
                    label="Format"
                    active={0}
                    options={[
                      {
                        label: (
                          <>
                            <RatioGlyph ratio="9:16" />
                            9:16
                          </>
                        ),
                        hint: 'TikTok',
                      },
                      {
                        label: (
                          <>
                            <RatioGlyph ratio="16:9" />
                            16:9
                          </>
                        ),
                      },
                    ]}
                  />
                </div>
                <Segmented
                  label="Définition"
                  active={0}
                  options={[
                    { label: '720p', hint: 'Pour TikTok' },
                    { label: '1080p', hint: 'Plus net' },
                  ]}
                />
              </div>
            </Section>

            <Section title="Durée">
              <p style={{ ...p, fontSize: 14, color: C.ink500 }}>
                {facts.veo.seconds} secondes — longueur imposée par ce modèle.
              </p>
            </Section>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                borderTop: `1px solid ${C.line}`,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  borderRadius: 12,
                  background: C.sunken,
                  padding: 16,
                  boxShadow:
                    glowCost > 0
                      ? `0 0 0 ${glowCost * 3}px rgba(255, 90, 31, ${glowCost * 0.35})`
                      : 'none',
                }}
              >
                <Recap
                  label="Coût de cette génération"
                  value={`${cost} crédits`}
                  strong={glowCost}
                />
                <Recap label="Solde après" value={`${before - cost} crédits`} />
              </div>
              <Button
                variant="ember"
                full
                pressed={press(f, V.tapGenerate)}
                {...(running ? { loading: f } : {})}
              >
                {running ? 'Génération en cours…' : `Générer pour ${cost} crédits`}
              </Button>
            </div>
          </Card>

          {/* Résultat */}
          <Card
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              minHeight: 352,
              boxSizing: 'border-box',
            }}
          >
            <h2 style={{ ...h, fontSize: 18 }}>Résultat</h2>
            {succeeded ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    overflow: 'hidden',
                    borderRadius: 16,
                    border: `1px solid ${C.line}`,
                    background: C.sunken,
                  }}
                >
                  <div style={{ margin: '0 auto', width: 234, height: 416 }}>
                    <Sequence from={V.done} layout="none">
                      <OffthreadVideo
                        src={staticFile('awa-lome.mp4')}
                        muted
                        style={{ width: 234, height: 416, objectFit: 'cover', display: 'block' }}
                      />
                    </Sequence>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: C.ink500,
                  }}
                >
                  <Badge>{veoModel.name}</Badge>
                  <Badge>9:16</Badge>
                  <Badge>{facts.veo.seconds} s</Badge>
                  <span>{cost} crédits consommés</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Button pressed={press(f, V.tapDownload)}>
                    <Icon name="download" size={16} />
                    Télécharger
                  </Button>
                  <Button variant="secondary">
                    <Icon name="refresh" size={16} />
                    Relancer
                  </Button>
                </div>
              </div>
            ) : running ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  textAlign: 'center',
                  minHeight: 260,
                }}
              >
                <Spinner frame={f} size={32} color={C.ink300} />
                <p style={{ ...p, fontSize: 14, color: C.ink700 }}>Génération en cours…</p>
                <p style={{ ...p, fontSize: 12, color: C.ink300 }}>
                  {remaining > 0 ? `Encore ~${remaining} s` : 'Bientôt terminé'}
                </p>
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  textAlign: 'center',
                  color: C.ink300,
                  minHeight: 260,
                }}
              >
                <Icon name="play" size={32} />
                <p style={{ ...p, maxWidth: 260, fontSize: 14 }}>
                  Écrivez votre description, et le résultat s’affichera ici.
                </p>
              </div>
            )}
          </Card>
        </div>
      </Content>
    </div>
  );
}

function Tile({
  label,
  selected,
  pressed = 0,
  children,
}: {
  label: string;
  selected: boolean;
  pressed?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: 64,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        transform: `scale(${1 - pressed * 0.06})`,
      }}
    >
      <span
        style={{
          width: 56,
          height: 56,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          borderRadius: 12,
          border: `2px solid ${selected ? C.ember500 : 'transparent'}`,
          background: C.sunken,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </span>
      <span
        style={{
          fontSize: 11,
          color: selected ? C.ink900 : C.ink500,
          fontWeight: selected ? 500 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Recap({ label, value, strong = 0 }: { label: string; value: string; strong?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 14,
      }}
    >
      <span style={{ color: C.ink500 }}>{label}</span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 16,
          color: strong > 0.3 ? C.ember600 : C.ink900,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Le clip, sorti de l'écran ────────────────────────────────────────── */

/**
 * Au moment fort, le clip quitte l'atelier et s'agrandit au-dessus de la
 * scène : c'est la preuve, elle doit se voir. Coordonnées de scène, pas
 * d'écran — d'où un composant à part, rendu par `Demo` hors de l'appareil.
 */
export function ClipPopOut({ f }: { f: number }) {
  if (f < V.popOut || f > V.popBack + 14) return null;
  const grow = tween(f, [V.popOut, V.popOut + 18], [0, 1], (t) => 1 - Math.pow(1 - t, 3));
  const leave = tween(f, [V.popBack, V.popBack + 12], [0, 1]);

  // Départ : la vidéo dans la carte « Résultat » (écran défilé à 1932).
  const from = { x: DEVICE.x + 61, y: DEVICE.y + 66, w: 234, h: 416 };
  const to = { x: 200 - 98.5, y: 140, w: 197, h: 350 };
  const lerp = (a: number, b: number) => a + (b - a) * grow;
  const x = lerp(from.x, to.x);
  const y = lerp(from.y, to.y);
  const w = lerp(from.w, to.w);
  const hh = lerp(from.h, to.h);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `rgba(250, 250, 250, ${0.72 * grow * (1 - leave)})`,
          zIndex: 30,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: hh,
          borderRadius: 18,
          overflow: 'hidden',
          zIndex: 31,
          opacity: 1 - leave,
          transform: `scale(${1 - leave * 0.06})`,
          boxShadow: `0 ${24 * grow}px ${60 * grow}px rgba(11, 11, 12, ${0.28 * grow})`,
        }}
      >
        <Sequence from={V.done} layout="none">
          <OffthreadVideo
            src={staticFile('awa-lome.mp4')}
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </Sequence>
      </div>
    </>
  );
}
