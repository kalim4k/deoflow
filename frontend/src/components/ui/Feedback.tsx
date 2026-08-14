import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AlertIcon, CheckCircleIcon, InfoIcon, XCircleIcon } from '@/components/icons';

/* ── Card ──────────────────────────────────────────────────────────────── */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card p-5 sm:p-6', className)}>{children}</div>;
}

/* ── Alert ─────────────────────────────────────────────────────────────── */

type AlertTone = 'success' | 'error' | 'warning' | 'info';

const ALERT_TONES: Record<AlertTone, { box: string; icon: typeof InfoIcon }> = {
  success: { box: 'border-gain-600/25 bg-gain-50 text-gain-700', icon: CheckCircleIcon },
  error: { box: 'border-loss-600/25 bg-loss-50 text-loss-700', icon: XCircleIcon },
  warning: { box: 'border-ember-500/30 bg-ember-50 text-ember-700', icon: AlertIcon },
  info: { box: 'border-line bg-sunken text-ink-700', icon: InfoIcon },
};

/**
 * Retour d'information au plus près de ce qui l'a produit. `error` et
 * `warning` s'annoncent via role="alert" ; le reste utilise role="status"
 * pour ne pas interrompre un lecteur d'écran sur une simple confirmation.
 */
export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = ALERT_TONES[tone];
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-4.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ── Badge ─────────────────────────────────────────────────────────────── */

type BadgeTone = 'neutral' | 'ink' | 'ember' | 'gain' | 'loss' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-sunken text-ink-500',
  ink: 'border-ink-900 bg-ink-900 text-white',
  ember: 'border-ember-500/25 bg-ember-50 text-ember-700',
  gain: 'border-gain-600/25 bg-gain-50 text-gain-700',
  loss: 'border-loss-600/25 bg-loss-50 text-loss-700',
  info: 'border-info-600/25 bg-info-50 text-info-600',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Pastille de statut partagée par les générations, les transactions et les
 * tableaux admin. La couleur n'est jamais le seul signal : le libellé écrit
 * toujours le statut en toutes lettres.
 */
const STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'ember',
  PROCESSING: 'info',
  RUNNING: 'info',
  SUCCEEDED: 'gain',
  COMPLETED: 'gain',
  PAID: 'gain',
  ACTIVE: 'gain',
  FAILED: 'loss',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  SUSPENDED: 'loss',
  INACTIVE: 'neutral',
  REFUNDED: 'info',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  RUNNING: 'Génération…',
  SUCCEEDED: 'Réussie',
  COMPLETED: 'Terminé',
  PAID: 'Payé',
  ACTIVE: 'Actif',
  FAILED: 'Échec',
  CANCELLED: 'Annulé',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  INACTIVE: 'Désactivé',
  REFUNDED: 'Remboursé',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{STATUS_LABELS[status] ?? status}</Badge>;
}

/* ── États de chargement / vide ────────────────────────────────────────── */

/** Réserve la place verticale pour que l'arrivée des données ne pousse rien. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-sunken', className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon ? <div className="text-ink-300">{icon}</div> : null}
      <p className="font-display text-base font-medium text-ink-900">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action}
    </div>
  );
}
