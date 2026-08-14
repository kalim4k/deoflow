'use client';

// Traitement d'une demande de versement.
//
// L'écran est conçu autour d'un geste qui se passe AILLEURS : l'administrateur
// ouvre son application mobile money, envoie l'argent, revient ici enregistrer
// la référence. La modale n'est donc pas un formulaire de paiement, c'est un
// registre — et sa priorité est que le numéro se recopie sans faute de frappe,
// puis que la référence saisie soit celle de la transaction réelle.
//
// D'où l'ordre : le destinataire et le montant en gros, copiables d'un clic,
// AVANT tout champ de saisie. Un formulaire qui demande d'abord la référence
// ferait remonter la page pour relire le numéro.

import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { InputField, TextareaField } from '@/components/ui/Field';
import { Alert, Badge, StatusBadge } from '@/components/ui/Feedback';
import { CheckIcon, ClipboardIcon, InfoIcon } from '@/components/icons';
import {
  payoutMethodLabel,
  updateWithdrawal,
  type AdminWithdrawal,
  type WithdrawalTarget,
} from '@/lib/deoflow/adminApi';
import { formatAmount, formatDateTime } from '@/lib/format';
import { errorMessage } from '@/lib/errorMessages';
import { useToast } from '@/contexts/ToastContext';

/** Champ recopié à la main dans une autre application — donc copiable d'un clic. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Presse-papiers refusé : on le dit, plutôt que de laisser croire que
      // c'est copié — ici une valeur non copiée devient une faute de frappe,
      // et une faute de frappe devient de l'argent envoyé au mauvais numéro.
      toast('Copie impossible — sélectionnez la valeur à la main.', 'error');
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-sunken px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-ink-500">{label}</p>
        <p className="truncate font-mono text-sm text-ink-900 select-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copier ${label}`}
        className="pressable shrink-0 cursor-pointer rounded-lg p-2 text-ink-500 hover:bg-surface hover:text-ink-900"
      >
        {copied ? (
          <CheckIcon className="size-4 text-gain-600" />
        ) : (
          <ClipboardIcon className="size-4" />
        )}
      </button>
    </div>
  );
}

export function PayoutModal({
  withdrawal,
  canSettle,
  onClose,
  onDone,
}: {
  withdrawal: AdminWithdrawal | null;
  /** SUPERADMIN — seul habilité à marquer versé ou échoué. */
  canSettle: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reference, setReference] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState<WithdrawalTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'settle' | 'fail'>('settle');

  // Remise à zéro à chaque demande ouverte : garder la référence de la
  // précédente serait le meilleur moyen de l'enregistrer deux fois.
  useEffect(() => {
    setReference('');
    setFailure('');
    setError(null);
    setMode('settle');
  }, [withdrawal?.id]);

  if (!withdrawal) return null;

  const open = withdrawal.status === 'PENDING' || withdrawal.status === 'PROCESSING';
  const phone = withdrawal.destination?.phone ?? null;
  const method = withdrawal.destination?.method ?? null;

  async function run(target: WithdrawalTarget, e?: FormEvent) {
    e?.preventDefault();
    if (!withdrawal) return;
    setError(null);
    setBusy(target);
    try {
      await updateWithdrawal(withdrawal.id, {
        status: target,
        ...(target === 'COMPLETED' ? { providerPayoutId: reference.trim() } : {}),
        ...(target === 'FAILED' ? { failureReason: failure.trim() } : {}),
      });
      toast(
        target === 'COMPLETED'
          ? 'Versement enregistré.'
          : target === 'FAILED'
            ? 'Demande marquée en échec.'
            : 'Demande prise en charge.',
        'success',
      );
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="Traiter la demande">
      <div className="flex flex-col gap-4">
        {/* Ce qu'il faut envoyer, et à qui. En premier, en gros. */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-3xl tabular-nums">
            {formatAmount(withdrawal.amount, withdrawal.currency)}
          </span>
          <StatusBadge status={withdrawal.status} />
        </div>

        <div className="flex flex-col gap-2">
          {method ? (
            <div className="flex items-center gap-2">
              <Badge tone="ink">{payoutMethodLabel(method)}</Badge>
              <span className="truncate text-sm text-ink-500">
                {withdrawal.user?.email ?? withdrawal.userId}
              </span>
            </div>
          ) : null}
          {phone ? <CopyRow label="Numéro à créditer" value={phone} /> : null}
        </div>

        <p className="text-xs text-ink-300">
          Demandé le {formatDateTime(withdrawal.requestedAt)}
          {withdrawal.processedAt
            ? ` · pris en charge le ${formatDateTime(withdrawal.processedAt)}`
            : ''}
        </p>

        {withdrawal.providerPayoutId ? (
          <CopyRow label="Référence enregistrée" value={withdrawal.providerPayoutId} />
        ) : null}
        {withdrawal.failureReason ? <Alert tone="warning">{withdrawal.failureReason}</Alert> : null}

        {error && <Alert tone="error">{error}</Alert>}

        {!open ? (
          <>
            <p className="flex items-start gap-2 rounded-xl bg-sunken p-3 text-xs text-ink-500">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-ink-300" />
              Cette demande est close. Un versement clos ne se rouvre pas : s’il faut corriger
              quelque chose, le créateur soumet une nouvelle demande — la correction laisse alors
              une trace au lieu d’en effacer une.
            </p>
            <Button variant="secondary" onClick={onClose} className="w-full">
              Fermer
            </Button>
          </>
        ) : !canSettle ? (
          <>
            <Alert tone="info">
              Enregistrer un versement est réservé à un SUPERADMIN. Vous pouvez prendre la demande
              en charge pour signaler que vous vous en occupez.
            </Alert>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} className="flex-1">
                Fermer
              </Button>
              {withdrawal.status === 'PENDING' && (
                <Button
                  variant="secondary"
                  loading={busy === 'PROCESSING'}
                  onClick={() => void run('PROCESSING')}
                  className="flex-1"
                >
                  Prendre en charge
                </Button>
              )}
            </div>
          </>
        ) : mode === 'settle' ? (
          <form onSubmit={(e) => void run('COMPLETED', e)} className="flex flex-col gap-4">
            <InputField
              label="Référence de la transaction"
              placeholder="ex. MP260813.1425.A12345"
              hint="Celle que votre application mobile money affiche après l’envoi. Obligatoire : c’est elle qui empêche d’enregistrer deux fois le même versement."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              autoComplete="off"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="ember"
                loading={busy === 'COMPLETED'}
                disabled={reference.trim().length < 3}
                className="flex-1"
              >
                Marquer versé
              </Button>
              {withdrawal.status === 'PENDING' && (
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy === 'PROCESSING'}
                  onClick={() => void run('PROCESSING')}
                >
                  Prendre en charge
                </Button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMode('fail')}
              className="pressable w-fit cursor-pointer text-xs text-ink-500 hover:text-loss-600 hover:underline"
            >
              Le versement a échoué
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void run('FAILED', e)} className="flex flex-col gap-4">
            <TextareaField
              label="Motif de l’échec"
              rows={3}
              placeholder="Numéro incorrect, compte mobile money fermé…"
              hint="Le créateur doit pouvoir comprendre quoi corriger avant de redemander."
              value={failure}
              onChange={(e) => setFailure(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode('settle')}
                className="flex-1"
              >
                Retour
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={busy === 'FAILED'}
                disabled={failure.trim().length < 3}
                className="flex-1"
              >
                Marquer en échec
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
