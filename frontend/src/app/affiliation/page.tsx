'use client';

// Affiliation — le créateur partage son lien, touche 25 % à vie.
//
// L'écran a une seule action : copier le lien. Tout le reste est de la lecture.
// D'où la hiérarchie : le lien en haut, plein cadre ; les chiffres ensuite ;
// le détail des commissions en dernier, pour qui veut vérifier.
//
// Aucun chiffre n'est calculé ici. Le serveur renvoie des montants déjà faits ;
// une addition côté navigateur finirait par diverger de ce qui est réellement
// dû, et c'est de l'argent.

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { WithdrawModal } from '@/components/app/WithdrawModal';
import { Button } from '@/components/ui/Button';
import { Alert, Card, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { CheckIcon, ClipboardIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { fetchReferrals, type ApiReferralDashboard } from '@/lib/deoflow/api';
import { ratePercent } from '@/lib/deoflow/referrals';
import { formatAmount, formatDate } from '@/lib/format';
import { errorMessage } from '@/lib/errorMessages';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/cn';

export default function AffiliationPage() {
  const { toast } = useToast();
  const [data, setData] = useState<ApiReferralDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // `useCallback` : passé en `onDone` à la modale, il ne doit pas changer
  // d'identité à chaque rendu.
  const reload = useCallback(() => {
    fetchReferrals()
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchReferrals()
      .then((row) => {
        if (!cancelled) setData(row);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : on le dit
      // plutôt que de laisser croire que c'est copié.
      toast('Copie impossible — sélectionnez le lien à la main.', 'error');
    }
  }

  async function share(link: string) {
    // `navigator.share` ouvre le partage natif Android : WhatsApp, TikTok, SMS.
    // C'est le geste réel de la cible ; à défaut, on retombe sur la copie.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'Deoflow',
          text: 'Crée tes images et vidéos IA avec Deoflow.',
          url: link,
        });
        return;
      } catch {
        // Partage annulé par l'utilisateur : ne rien faire, surtout pas copier
        // dans son dos.
        return;
      }
    }
    await copy(link);
  }

  const rate = data ? ratePercent(data.rateBps) : ratePercent();

  return (
    <AppShell
      title="Affiliation"
      description={`Partagez votre lien, touchez ${rate} % sur tous les achats de vos filleuls — à vie.`}
    >
      <div className="flex flex-col gap-5">
        {error && <Alert tone="error">{error}</Alert>}

        {/* ── Le lien ───────────────────────────────────────────────── */}
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-base">Votre lien</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Toute personne qui crée son compte depuis ce lien vous est rattachée définitivement.
              Elle n’a rien à saisir.
            </p>
          </div>

          {data ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                {/* `readOnly` et non `disabled` : le texte reste sélectionnable
                    à la main quand le presse-papiers est refusé. */}
                <input
                  readOnly
                  value={data.link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Votre lien d’affiliation"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-sunken px-4 py-3 font-mono text-sm text-ink-700"
                />
                <div className="flex gap-2">
                  <Button
                    variant={copied ? 'secondary' : 'primary'}
                    onClick={() => void copy(data.link)}
                    className="flex-1 sm:flex-none"
                  >
                    {copied ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <ClipboardIcon className="size-4" />
                    )}
                    {copied ? 'Copié' : 'Copier'}
                  </Button>
                  <Button
                    variant="ember"
                    onClick={() => void share(data.link)}
                    className="flex-1 sm:flex-none"
                  >
                    Partager
                  </Button>
                </div>
              </div>

              <p className="text-xs text-ink-300">
                Votre code : <span className="font-mono text-ink-500">{data.code}</span>
              </p>
            </>
          ) : (
            <Skeleton className="h-12 w-full" />
          )}
        </Card>

        {/* ── Les chiffres ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Filleuls" value={data ? String(data.stats.referrals) : null} />
          <Stat
            label="Dont acheteurs"
            value={data ? String(data.stats.buyers) : null}
            hint="Ceux qui ont rechargé au moins une fois."
          />
          <Stat
            label="Taux de conversion"
            value={
              data ? (data.stats.referrals > 0 ? `${data.stats.conversionBps / 100} %` : '—') : null
            }
            // « — » et non « 0 % » : sans filleul le taux n'est pas nul, il
            // n'est pas encore mesurable. Afficher 0 % se lirait comme un échec.
            hint={
              data && data.stats.referrals > 0
                ? `${data.stats.buyers} sur ${data.stats.referrals} filleuls`
                : 'Dès votre premier filleul.'
            }
          />
          <Stat
            label="Commissions gagnées"
            value={data ? formatAmount(data.stats.earnedFcfa) : null}
            hint={data ? `Sur ${formatAmount(data.stats.volumeFcfa)} d’achats` : undefined}
          />
          <Stat
            label="En attente de validation"
            value={data ? formatAmount(data.stats.pendingFcfa) : null}
            hint={
              data && data.stats.paidFcfa > 0
                ? `${formatAmount(data.stats.paidFcfa)} déjà versé`
                : 'Vos demandes en cours de traitement.'
            }
          />
          <Stat
            label="Disponible"
            value={data ? formatAmount(data.stats.availableFcfa) : null}
            hint="Retirable maintenant."
            accent
          />
        </div>

        {/* ── Le retrait ────────────────────────────────────────────── */}
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base">Retirer vos commissions</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Mixx by Yas, Moov Money, Wave, Orange Money ou MTN MoMo. Versement traité à la main,
              sous quelques jours ouvrés.
            </p>
          </div>
          <Button
            variant="ember"
            onClick={() => setWithdrawing(true)}
            // Désactivé tant que le solde est nul : un formulaire qui ne peut
            // qu'échouer ne doit pas s'ouvrir.
            disabled={!data || data.stats.availableFcfa <= 0}
            className="shrink-0"
          >
            <WalletIcon className="size-4" />
            Retirer
          </Button>
        </Card>

        {/* ── Le détail ─────────────────────────────────────────────── */}
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-base">Dernières commissions</h2>

          {!data ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data.commissions.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="size-8" />}
              title="Aucune commission pour l’instant"
              description="Partagez votre lien avec des créateurs. Dès que l’un d’eux recharge son compte, votre commission apparaît ici."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.commissions.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{row.referee}</p>
                    <p className="mt-0.5 text-xs text-ink-300">
                      {formatDate(row.createdAt)} · achat de {formatAmount(row.orderAmount)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'shrink-0 font-display text-sm tabular-nums',
                      row.status === 'REVERSED' ? 'text-ink-300 line-through' : 'text-gain-600',
                    )}
                  >
                    +{formatAmount(row.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <WithdrawModal
        open={withdrawing}
        onClose={() => setWithdrawing(false)}
        // Le solde vient du serveur et n'est jamais recalculé côté navigateur :
        // c'est lui qui fait autorité, la modale ne fait que le montrer.
        availableFcfa={data?.stats.availableFcfa ?? 0}
        rules={
          data?.payout ?? {
            minAmountFcfa: 1,
            maxAmountFcfa: null,
            requiresPin: false,
            hasPin: false,
          }
        }
        onDone={reload}
      />
    </AppShell>
  );
}

/** Un chiffre-clé. `value === null` = pas encore connu, donc grisé. */
function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string | null;
  hint?: string | undefined;
  accent?: boolean;
}) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <p className="text-xs text-ink-500">{label}</p>
      {value === null ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <p
          className={cn(
            'font-display text-xl tabular-nums sm:text-2xl',
            accent && 'text-ember-600',
          )}
        >
          {value}
        </p>
      )}
      {hint ? <p className="text-[0.6875rem] text-ink-300">{hint}</p> : null}
    </div>
  );
}
