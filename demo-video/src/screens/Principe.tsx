/**
 * Chapitre 1 — le principe : un compte neuf recharge en Mobile Money, le solde
 * arrive, et le tableau de bord propose de créer.
 *
 * Écrans reproduits : `/dashboard` (premier passage, puis crédité),
 * `/wallet/topup`, `/wallet/topup/confirmation`. Aucun opérateur n'est nommé :
 * le site s'en abstient aussi, c'est la page de Maketou qui les présente.
 */
// Import explicite : l'API `bundle()` de Remotion compile le JSX en mode classique.
import React from 'react';
import facts from '../facts.json';
import { Icon, Spinner } from '../icons';
import { counter, pageIn, steps, tween } from '../motion';
import { C, DISPLAY } from '../theme';
import { AppHeader, BackLink, Badge, Button, Card, Content, Finger, PageTitle, h, p } from '../ui';

const pack = facts.starterPack;
const popular = facts.packs[1];

/** Images clés, relatives au début du chapitre. */
export const P = {
  tapRecharge: 36,
  topup: 46,
  tapStarter: 70,
  tapPay: 118,
  confirmation: 136,
  paid: 158,
  dashboard: 186,
  scrollActions: 222,
  glowImage: 252,
  glowVideo: 272,
  tapMenu: 318,
  end: 335,
} as const;

export function PrincipeScreen({ f }: { f: number }) {
  const credits = f < P.paid ? 0 : counter(f, P.paid, 18, 0, pack.credits);
  const pulse =
    tween(f, [P.paid, P.paid + 6], [0, 1]) * tween(f, [P.paid + 18, P.paid + 30], [1, 0]);

  let page;
  if (f < P.topup) page = <Dashboard f={f} credits={0} />;
  else if (f < P.confirmation) page = <Topup f={f} />;
  else if (f < P.dashboard) page = <Confirmation f={f} />;
  else page = <Dashboard f={f} credits={pack.credits} />;

  return (
    <>
      <AppHeader credits={credits} pulse={pulse} />
      {page}
      <Finger
        frame={f}
        keys={[
          { at: 22, x: 210, y: 300 },
          { at: P.tapRecharge, x: 81, y: 203, tap: true },
          { at: P.tapStarter, x: 170, y: 299, tap: true },
          { at: P.tapPay, x: 178, y: 289, tap: true },
          { at: P.tapPay + 16, x: 230, y: 330 },
        ]}
      />
      <Finger
        frame={f}
        keys={[
          { at: 300, x: 160, y: 200 },
          { at: P.tapMenu, x: 36, y: 30, tap: true },
        ]}
      />
    </>
  );
}

/* ── Tableau de bord ──────────────────────────────────────────────────── */

function Dashboard({ f, credits }: { f: number; credits: number }) {
  const fresh = credits === 0;
  const enter = fresh ? { opacity: 1 } : pageIn(f, P.dashboard);
  const scroll = fresh
    ? 0
    : steps(
        f,
        [
          [0, 0],
          [P.scrollActions, 560],
        ],
        30,
      );
  const shown = fresh ? 0 : counter(f, P.dashboard + 4, 20, 0, credits);

  const glowImage =
    tween(f, [P.glowImage, P.glowImage + 8], [0, 1]) *
    tween(f, [P.glowImage + 22, P.glowImage + 32], [1, 0]);
  const glowVideo =
    tween(f, [P.glowVideo, P.glowVideo + 8], [0, 1]) *
    tween(f, [P.glowVideo + 22, P.glowVideo + 32], [1, 0]);
  const pressRecharge = fresh ? press(f, P.tapRecharge) : 0;

  return (
    <div style={{ position: 'absolute', inset: 0, ...enter }}>
      <Content scroll={scroll}>
        <PageTitle
          title="Bonjour Kofi"
          description="Votre solde, vos créations, et de quoi en lancer une autre."
          action={
            <Button variant="secondary" pressed={pressRecharge}>
              <Icon name="coins" size={16} />
              Recharger
            </Button>
          }
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {fresh ? (
            <Card borderColor={C.ink900}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <h2 style={{ ...h, fontSize: 18 }}>Rechargez pour commencer</h2>
                  <p style={{ ...p, fontSize: 14, color: C.ink500 }}>
                    Le {pack.name.toLowerCase()} donne {pack.credits} crédits pour {pack.price} — de
                    quoi générer {Math.floor(pack.credits / 24)} images Nano Banana.
                  </p>
                </div>
                <Button variant="ember">
                  <Icon name="coins" size={16} />
                  Acheter des crédits
                </Button>
              </div>
            </Card>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Stat
              label="Solde"
              icon="coins"
              value={shown}
              hint={`${Math.floor(shown / 24)} image${shown >= 48 ? 's' : ''} Nano Banana`}
            />
            <Stat label="Créations" icon="spark" value={0} hint="Images et vidéos produites" />
            <Stat
              label="Crédits consommés"
              icon="image"
              value={0}
              hint="Depuis la création du compte"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Action
              icon="image"
              title="Générer une image"
              body="Un prompt, un modèle, un ratio. Prêt en quelques secondes."
              glow={glowImage}
            />
            <Action
              icon="video"
              title="Générer une vidéo"
              body="Animez votre personnage en 3, 5 ou 10 secondes."
              glow={glowVideo}
            />
          </div>
        </div>
      </Content>
    </div>
  );
}

function Stat({
  label,
  icon,
  value,
  hint,
}: {
  label: string;
  icon: 'coins' | 'spark' | 'image';
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.ink500 }}
        >
          <Icon name={icon} size={16} color={C.ink300} />
          {label}
        </span>
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 28,
            lineHeight: 1.25,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 12, color: C.ink300 }}>{hint}</span>
      </div>
    </Card>
  );
}

function Action({
  icon,
  title,
  body,
  glow,
}: {
  icon: 'image' | 'video';
  title: string;
  body: string;
  glow: number;
}) {
  return (
    <Card glow={glow} style={{ transform: `scale(${1 + glow * 0.02})` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <span
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 12,
            background: C.sunken,
          }}
        >
          <Icon name={icon} size={20} color={C.ink900} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {title}
            <Icon name="arrowRight" size={16} color={glow > 0.3 ? C.ember500 : C.ink300} />
          </span>
          <span style={{ fontSize: 14, color: C.ink500, lineHeight: 1.45 }}>{body}</span>
        </span>
      </div>
    </Card>
  );
}

/* ── Recharge ─────────────────────────────────────────────────────────── */

function Topup({ f }: { f: number }) {
  const scroll = steps(
    f,
    [
      [0, 0],
      [80, 725],
    ],
    26,
  );
  const starter = f >= P.tapStarter;
  const redirecting = f >= P.tapPay + 4;
  const selected = starter ? pack : popular;

  return (
    <div style={{ position: 'absolute', inset: 0, ...pageIn(f, P.topup) }}>
      <Content scroll={scroll}>
        <PageTitle title="Acheter des crédits" description="Les crédits n’expirent pas." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <BackLink label="Mon portefeuille" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ ...h, fontSize: 18, marginBottom: 0 }}>Choisissez un pack</h2>
            {facts.packs.map((item) => {
              const on = item.name === selected?.name;
              return (
                <Card
                  key={item.name}
                  borderColor={on ? C.ink900 : C.line}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    transform: `scale(${item.name === pack.name ? 1 - press(f, P.tapStarter) * 0.03 : 1})`,
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
                    >
                      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16 }}>
                        {item.name}
                      </span>
                      {item.badge === 'Populaire' ? <Badge tone="ember">{item.badge}</Badge> : null}
                    </span>
                    <span style={{ marginTop: 4, fontSize: 14, color: C.ink500 }}>
                      {item.credits} crédits — {item.perCredit} FCFA le crédit
                    </span>
                    <span style={{ marginTop: 2, fontSize: 12, color: C.ink300 }}>
                      {item.images} images, ou {item.klingClips} clips Kling de 5 s
                    </span>
                  </span>
                  <span
                    style={{
                      fontFamily: DISPLAY,
                      fontWeight: 700,
                      fontSize: 19,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.price}
                  </span>
                </Card>
              );
            })}
          </div>

          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h2 style={{ ...h, fontSize: 18 }}>Récapitulatif</h2>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  borderRadius: 12,
                  background: C.sunken,
                  padding: 16,
                  fontSize: 14,
                }}
              >
                <Row label="À payer" value={selected?.price ?? ''} />
                <Row label="Crédits ajoutés" value={`+${selected?.credits ?? 0}`} />
              </div>
              <p style={{ ...p, fontSize: 14, color: C.ink500 }}>
                Vous choisirez votre moyen de paiement et saisirez votre numéro sur la page
                sécurisée, puis vous confirmerez depuis votre téléphone.
              </p>
              <Button
                variant="ember"
                full
                pressed={press(f, P.tapPay)}
                {...(redirecting ? { loading: f } : {})}
              >
                {redirecting ? 'Redirection en cours…' : `Payer ${selected?.price ?? ''}`}
              </Button>
            </div>
          </Card>
        </div>
      </Content>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}
    >
      <span style={{ color: C.ink500 }}>{label}</span>
      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16 }}>{value}</span>
    </div>
  );
}

/* ── Confirmation ─────────────────────────────────────────────────────── */

function Confirmation({ f }: { f: number }) {
  const paid = f >= P.paid;
  const pop = tween(f, [P.paid, P.paid + 10], [0.6, 1], (t) => 1 - Math.pow(1 - t, 3));

  return (
    <div style={{ position: 'absolute', inset: 0, ...pageIn(f, P.confirmation) }}>
      <Content scroll={0}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            textAlign: 'center',
            paddingTop: 8,
          }}
        >
          <span
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              display: 'grid',
              placeItems: 'center',
              background: paid ? C.gain50 : C.sunken,
              color: paid ? C.gain600 : C.ink500,
              transform: `scale(${paid ? pop : 1})`,
            }}
          >
            {paid ? <Icon name="checkCircle" size={32} /> : <Spinner frame={f} size={32} />}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 style={{ ...h, fontSize: 24, lineHeight: 1.15 }}>
              {paid ? `+${pack.credits} crédits ajoutés` : 'Paiement en attente de confirmation'}
            </h1>
            <p style={{ ...p, fontSize: 14, color: C.ink500 }}>
              {paid
                ? `Votre nouveau solde est de ${pack.credits} crédits.`
                : 'Validez la demande sur votre téléphone. Cet écran se met à jour tout seul.'}
            </p>
          </div>
          <Card style={{ width: '100%', boxSizing: 'border-box' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 14,
                textAlign: 'left',
              }}
            >
              <Line label="Pack" value={pack.name} />
              <Line label="Montant" value={pack.price} />
            </div>
          </Card>
        </div>
      </Content>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
    >
      <span style={{ color: C.ink500 }}>{label}</span>
      <span style={{ color: C.ink900 }}>{value}</span>
    </div>
  );
}

/** Le tableau de bord tel qu'il est à la fin du chapitre, sous le tiroir du suivant. */
export function DashboardFinal() {
  return <Dashboard f={P.end} credits={pack.credits} />;
}

/** Enfoncement bref d'un bouton au moment où le doigt le touche. */
export function press(f: number, at: number): number {
  const t = f - at;
  return t >= 0 && t < 10 ? Math.sin((t / 10) * Math.PI) : 0;
}
