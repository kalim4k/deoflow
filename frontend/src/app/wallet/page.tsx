'use client';

// Wallet (3.9 du PRD) : solde, puis historique qui distingue clairement les
// achats (crédits ajoutés) des consommations (crédits utilisés) — c'est le
// critère d'acceptation d'US8.
//
// Le journal vient du serveur (`/api/credits`), plus du `localStorage` : depuis
// que les générations et les achats coûtent de l'argent réel, la vérité est la
// table `CreditTransaction`.

import Link from 'next/link';
import { AppShell } from '@/components/app/AppShell';
import { buttonStyles } from '@/components/ui/Button';
import { Alert, Badge, Card, EmptyState } from '@/components/ui/Feedback';
import { Stat } from '@/components/ui/Stat';
import { CoinsIcon, PlusIcon } from '@/components/icons';
import { useApi } from '@/lib/useApi';
import { useCreditsContext } from '@/contexts/CreditsContext';
import type { ApiCreditTransaction } from '@/lib/deoflow/api';
import { LOW_BALANCE_THRESHOLD } from '@/lib/deoflow/types';
import { formatAmount, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: 'Achat',
  GENERATION: 'Génération',
  ADMIN_ADJUSTMENT: 'Ajustement',
  REFUND: 'Remboursement',
};

export default function WalletPage() {
  const { credits, loading: creditsLoading } = useCreditsContext();
  const { data, loading: journalLoading } = useApi<{
    credits: number;
    transactions: ApiCreditTransaction[];
  }>('/api/credits');

  const transactions = data?.transactions ?? [];
  const spent = transactions
    .filter((t) => t.credits < 0)
    .reduce((sum, t) => sum + Math.abs(t.credits), 0);
  const purchased = transactions
    .filter((t) => t.movement === 'PURCHASE')
    .reduce((sum, t) => sum + (t.amountFcfa ?? 0), 0);

  return (
    <AppShell
      title="Crédits"
      description="Votre solde et le détail de chaque mouvement."
      actions={
        <Link href="/wallet/topup" className={buttonStyles('ember', 'md')}>
          <PlusIcon className="size-4" />
          Recharger
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Solde actuel"
            icon={<CoinsIcon className="size-4" />}
            value={credits}
            loading={creditsLoading}
            hint={`soit ${credits} images ou ${Math.floor(credits / 5)} clips de 5 s`}
            className={cn(!creditsLoading && credits < LOW_BALANCE_THRESHOLD && 'border-ember-500')}
          />
          <Stat
            label="Crédits consommés"
            value={spent}
            loading={journalLoading}
            hint="sur les 30 derniers mouvements"
          />
          <Stat
            label="Total rechargé"
            value={formatAmount(purchased, 'XOF')}
            loading={journalLoading}
            hint="sur les 30 derniers mouvements"
          />
        </div>

        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-lg">Historique</h2>

          {journalLoading ? (
            // Un squelette, jamais « aucun mouvement » : affirmer que le journal
            // est vide avant de l'avoir lu ferait croire à une perte.
            <ul className="flex flex-col divide-y divide-line" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <div className="h-4 w-2/5 animate-pulse rounded bg-sunken" />
                    <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-sunken" />
                  </div>
                  <div className="h-4 w-16 animate-pulse rounded bg-sunken" />
                </li>
              ))}
            </ul>
          ) : transactions.length === 0 ? (
            <EmptyState
              icon={<CoinsIcon className="size-8" />}
              title="Aucun mouvement"
              description="Vos achats et vos consommations de crédits s’afficheront ici."
              action={
                <Link href="/wallet/topup" className={buttonStyles('ember', 'sm')}>
                  Acheter des crédits
                </Link>
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {transactions.map((t) => {
                const positive = t.credits > 0;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-900">{t.label}</p>
                      <p className="flex items-center gap-2 text-xs text-ink-300">
                        <Badge tone={positive ? 'gain' : 'neutral'}>
                          {MOVEMENT_LABELS[t.movement] ?? t.movement}
                        </Badge>
                        {formatDateTime(t.createdAt)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p
                        className={cn(
                          'font-display tabular-nums',
                          positive ? 'text-gain-700' : 'text-ink-900',
                        )}
                      >
                        {positive ? '+' : ''}
                        {t.credits} cr.
                      </p>
                      {t.amountFcfa !== null ? (
                        <p className="text-xs text-ink-300">{formatAmount(t.amountFcfa, 'XOF')}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Alert tone="info">
          Les paiements passent par Maketou. La confirmation peut prendre quelques minutes après
          validation sur votre téléphone — vos crédits arrivent ensuite tout seuls.
        </Alert>
      </div>
    </AppShell>
  );
}
