/**
 * Chapitre 2 — créer un personnage : menu, liste vide, formulaire, puis la
 * fiche où le visage arrive.
 *
 * Écrans reproduits : le tiroir de navigation (`Sidebar`), `/avatars`,
 * `/avatars/new`, `/avatars/[id]`. Le visage affiché est le vrai rendu
 * Nano Banana 2 de cette description — voir `public/provenance.json`.
 */
// Import explicite : l'API `bundle()` de Remotion compile le JSX en mode classique.
import React from 'react';
import { Img, staticFile } from 'remotion';
import facts from '../facts.json';
import { Icon, Spinner, type IconName } from '../icons';
import { counter, pageIn, steps, tween, typed, typingFrames } from '../motion';
import { C, DISPLAY } from '../theme';
import {
  AppHeader,
  BackLink,
  Badge,
  Button,
  Card,
  Content,
  Field,
  Finger,
  Logo,
  PageTitle,
  h,
  p,
} from '../ui';
import { DashboardFinal, press } from './Principe';

export const AVATAR_NAME = 'Awa';
/**
 * L'exemple du champ « Description » du site, sans ses points de suspension.
 * C'est le texte EXACT envoyé pour produire `public/awa.jpg` — voir
 * `frontend/scripts/generate-demo-assets.ts` : ce qu'on voit taper est ce qui
 * a été généré.
 */
export const AVATAR_DESCRIPTION =
  'Jeune femme togolaise de 24 ans, mince, 1m68, tresses longues, style afro-urbain, grandes boucles d’oreilles dorées';

const face = facts.faceModels[0]!;
const start = facts.starterPack.credits;
const DESCRIPTION_CPS = 1.25;

export const A = {
  drawerOut: 0,
  tapNav: 28,
  drawerIn: 34,
  list: 40,
  tapNew: 62,
  form: 70,
  tapName: 84,
  typeName: 88,
  scrollDescription: 102,
  tapDescription: 124,
  typeDescription: 128,
  scrollGenerate: 228,
  tapGenerate: 266,
  sheet: 286,
  scrollFace: 292,
  faceReady: 345,
  scrollUse: 400,
  glowUse: 425,
  tapVideo: 462,
  end: 480,
} as const;

export function PersonnageScreen({ f }: { f: number }) {
  const credits =
    f < A.tapGenerate + 2 ? start : counter(f, A.tapGenerate + 2, 16, start, start - face.cost);
  const pulse =
    tween(f, [A.tapGenerate + 2, A.tapGenerate + 8], [0, 1]) *
    tween(f, [A.tapGenerate + 18, A.tapGenerate + 30], [1, 0]);

  let page;
  if (f < A.list) page = <DashboardFinal />;
  else if (f < A.form) page = <List f={f} />;
  else if (f < A.sheet) page = <Form f={f} />;
  else page = <Sheet f={f} />;

  return (
    <>
      <AppHeader credits={credits} pulse={pulse} />
      {page}
      {f < A.list + 2 ? <Drawer f={f} /> : null}
      <Finger
        frame={f}
        keys={[
          { at: 14, x: 150, y: 120 },
          { at: A.tapNav, x: 112, y: 268, tap: true },
          { at: A.tapNew, x: 90, y: 203, tap: true },
          { at: A.tapName, x: 178, y: 287, tap: true },
          { at: A.tapName + 16, x: 260, y: 335 },
          { at: A.tapDescription, x: 178, y: 230, tap: true },
          { at: A.tapDescription + 16, x: 300, y: 330 },
          { at: A.tapGenerate, x: 178, y: 298, tap: true },
          { at: A.tapGenerate + 16, x: 260, y: 340 },
        ]}
      />
      <Finger
        frame={f}
        keys={[
          { at: 446, x: 160, y: 330 },
          { at: A.tapVideo, x: 230, y: 244, tap: true },
        ]}
      />
    </>
  );
}

/* ── Tiroir de navigation ─────────────────────────────────────────────── */

function Drawer({ f }: { f: number }) {
  const open =
    tween(f, [0, 12], [0, 1], (t) => 1 - Math.pow(1 - t, 3)) *
    tween(f, [A.drawerIn, A.drawerIn + 8], [1, 0]);
  const chosen = f >= A.tapNav;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      <div
        style={{ position: 'absolute', inset: 0, background: `rgba(11, 11, 12, ${0.35 * open})` }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 264,
          background: C.surface,
          borderRight: `1px solid ${C.line}`,
          transform: `translateX(${(open - 1) * 264}px)`,
          padding: '20px 16px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 36,
          }}
        >
          <Logo />
          <div
            style={{
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              color: C.ink500,
            }}
          >
            <Icon name="close" size={20} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <NavItem icon="home" label="Tableau de bord" active={!chosen} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <GroupLabel>Créer</GroupLabel>
            <NavItem icon="image" label="Image" />
            <NavItem icon="video" label="Vidéo" />
            <NavItem icon="user" label="Personnages" active={chosen} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <GroupLabel>Explorer</GroupLabel>
            <NavItem icon="spark" label="Modèles" />
            <NavItem icon="gallery" label="Galerie" />
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <p
      style={{
        ...p,
        padding: '0 12px 6px',
        fontSize: 12,
        fontWeight: 500,
        color: C.ink300,
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      style={{
        minHeight: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 12px',
        borderRadius: 12,
        fontSize: 14,
        background: active ? C.sunken : 'transparent',
        color: active ? C.ink900 : C.ink500,
        fontWeight: active ? 500 : 400,
      }}
    >
      <Icon name={icon} size={18} color={active ? C.ember500 : C.ink300} />
      {label}
    </div>
  );
}

/* ── Liste vide ───────────────────────────────────────────────────────── */

function List({ f }: { f: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, ...pageIn(f, A.list) }}>
      <Content scroll={0}>
        <PageTitle
          title="Personnages"
          description="Vos influenceurs — un visage et une description, réutilisables dans chaque génération."
          action={
            <Button variant="ember" pressed={press(f, A.tapNew)}>
              <Icon name="plus" size={16} />
              Nouvel avatar
            </Button>
          }
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            borderRadius: 16,
            border: `1px dashed ${C.lineStrong}`,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <Icon name="user" size={32} color={C.ink300} />
          <p style={{ ...p, fontFamily: DISPLAY, fontWeight: 500, fontSize: 16, color: C.ink900 }}>
            Aucun personnage
          </p>
          <p style={{ ...p, fontSize: 14, color: C.ink500 }}>
            Créez votre influenceur une fois : son visage et sa description seront joints
            automatiquement à chacune de vos générations, image comme vidéo.
          </p>
          <Button variant="ember" size="sm">
            Créer mon premier avatar
          </Button>
        </div>
      </Content>
    </div>
  );
}

/* ── Formulaire ───────────────────────────────────────────────────────── */

function Form({ f }: { f: number }) {
  const scroll = steps(
    f,
    [
      [0, 0],
      [A.scrollDescription, 230],
      [A.scrollGenerate, 792],
    ],
    22,
  );
  const name = typed(AVATAR_NAME, f, A.typeName, 0.25);
  const description = typed(AVATAR_DESCRIPTION, f, A.typeDescription, DESCRIPTION_CPS);
  const busy = f >= A.tapGenerate + 3;

  return (
    <div style={{ position: 'absolute', inset: 0, ...pageIn(f, A.form) }}>
      <Content scroll={scroll}>
        <PageTitle
          title="Nouvel avatar"
          description="Un visage et une description, réutilisables partout."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <BackLink label="Mes personnages" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field
                  label="Nom"
                  required
                  placeholder="Awa"
                  hint="Pour vous y retrouver — il n’est pas envoyé au modèle."
                  value={name}
                  focused={f >= A.tapName && f < A.tapDescription}
                  frame={f}
                />
                <Field
                  label="Description"
                  aside={`${Array.from(description).length} / 4000`}
                  rows={5}
                  placeholder="Jeune femme togolaise de 24 ans, mince, 1m68, tresses longues, style afro-urbain, grandes boucles d’oreilles dorées…"
                  hint="Le corps, la tenue, le style. Ce texte sera joint à chacune de vos générations : vous n’aurez plus à le réécrire."
                  value={description}
                  focused={f >= A.tapDescription && f < A.scrollGenerate}
                  frame={f}
                />
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <h2 style={{ ...h, fontSize: 16 }}>Photo de départ</h2>
                  <p style={{ ...p, marginTop: 2, fontSize: 12, color: C.ink500 }}>
                    Facultative. Sans elle, le visage est inventé à partir de votre description.
                  </p>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 16,
                    border: `1px dashed ${C.lineStrong}`,
                    background: C.sunken,
                    padding: '24px 16px',
                    textAlign: 'center',
                  }}
                >
                  <Icon name="upload" size={20} color={C.ink300} />
                  <span style={{ fontSize: 14, color: C.ink700 }}>
                    Déposez une photo ou{' '}
                    <span style={{ textDecoration: 'underline' }}>parcourez</span>
                  </span>
                  <span style={{ fontSize: 12, color: C.ink300 }}>JPG, PNG ou WEBP.</span>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <h2 style={{ ...h, fontSize: 18 }}>Générer le visage</h2>
                  <div
                    style={{
                      display: 'grid',
                      gridAutoFlow: 'column',
                      gridAutoColumns: '1fr',
                      gap: 8,
                    }}
                  >
                    {facts.faceModels.map((model, i) => (
                      <div
                        key={model.slug}
                        style={{
                          minHeight: 44,
                          borderRadius: 12,
                          border: `1px solid ${i === 0 ? C.ink900 : C.line}`,
                          background: i === 0 ? C.ink900 : C.surface,
                          color: i === 0 ? '#fff' : C.ink700,
                          padding: '8px 12px',
                          textAlign: 'center',
                          fontSize: 14,
                          fontWeight: 500,
                        }}
                      >
                        {model.name}
                        <span
                          style={{
                            display: 'block',
                            marginTop: 2,
                            fontSize: 11,
                            fontWeight: 400,
                            color: i === 0 ? 'rgba(255,255,255,0.7)' : C.ink300,
                          }}
                        >
                          {model.cost} crédits
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <p
                  style={{
                    ...p,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    borderRadius: 12,
                    background: C.sunken,
                    padding: 12,
                    fontSize: 12,
                    color: C.ink500,
                  }}
                >
                  <Icon name="info" size={16} color={C.ink300} style={{ marginTop: 1 }} />
                  Le visage sera cadré tête et épaules, de face, sur fond blanc uni — c’est ce qui
                  le rend réutilisable dans vos scènes.
                </p>
                <Button
                  variant="ember"
                  full
                  pressed={press(f, A.tapGenerate)}
                  {...(busy ? { loading: f } : {})}
                >
                  {busy ? 'Génération…' : `Générer — ${face.cost} crédits`}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </Content>
    </div>
  );
}

/* ── Fiche du personnage ──────────────────────────────────────────────── */

function Sheet({ f }: { f: number }) {
  const scroll = steps(
    f,
    [
      [0, 0],
      [A.scrollFace, 160],
      [A.scrollUse, 950],
    ],
    26,
  );
  const ready = f >= A.faceReady;
  const reveal = tween(f, [A.faceReady, A.faceReady + 14], [0, 1]);
  const glow =
    tween(f, [A.glowUse, A.glowUse + 8], [0, 1]) *
    tween(f, [A.glowUse + 26, A.glowUse + 36], [1, 0]);

  return (
    <div style={{ position: 'absolute', inset: 0, ...pageIn(f, A.sheet) }}>
      <Content scroll={scroll}>
        <PageTitle title={AVATAR_NAME} description="Son visage et sa description." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <BackLink label="Mes personnages" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: C.sunken,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      color: C.ink300,
                      opacity: 1 - reveal,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Spinner frame={f} size={28} />
                      <span style={{ fontSize: 12 }}>Génération du visage…</span>
                    </div>
                  </div>
                  {ready ? (
                    <Img
                      src={staticFile('awa.jpg')}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: reveal,
                        transform: `scale(${1.06 - reveal * 0.06})`,
                        filter: `blur(${(1 - reveal) * 8}px)`,
                      }}
                    />
                  ) : null}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 12,
                    color: C.ink500,
                  }}
                >
                  <span>Visage généré par {face.slug}</span>
                  {ready ? <Badge tone="gain">Prêt</Badge> : <Badge>En cours</Badge>}
                </div>
                <Button variant="secondary" full style={{ opacity: ready ? 1 : 0.45 }}>
                  <Icon name="refresh" size={16} />
                  Régénérer — {face.cost} crédits
                </Button>
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="Nom" value={AVATAR_NAME} frame={f} />
                <Field
                  label="Description"
                  aside={`${Array.from(AVATAR_DESCRIPTION).length} / 4000`}
                  rows={6}
                  hint="Jointe à chacune de vos générations. La modifier ne coûte rien et ne régénère pas le visage."
                  value={AVATAR_DESCRIPTION}
                  frame={f}
                />
                <div>
                  <Button style={{ opacity: 0.45 }}>Enregistrer</Button>
                </div>
              </div>
            </Card>

            <Card glow={glow}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 style={{ ...h, fontSize: 16 }}>Utiliser ce personnage</h2>
                <p style={{ ...p, fontSize: 12, color: C.ink500 }}>
                  Sélectionnez-le dans l’atelier : son visage et sa description partiront
                  automatiquement avec votre description de scène.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Button variant="ember" size="sm">
                    Générer une image
                  </Button>
                  <Button variant="secondary" size="sm" pressed={press(f, A.tapVideo)}>
                    Générer une vidéo
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Content>
    </div>
  );
}

/** Pour `Demo` : fin de la frappe de la description, en images du chapitre. */
export const DESCRIPTION_DONE =
  A.typeDescription + typingFrames(AVATAR_DESCRIPTION, DESCRIPTION_CPS);
