'use client';

// Demande de versement d'une commission d'affiliation.
//
// Le montant, le moyen de paiement et le numéro sont vérifiés ICI avant l'envoi
// — mêmes règles que le serveur, à la virgule près. Ce n'est pas une garantie
// (le serveur revalide et fait autorité), c'est une politesse : un formulaire
// rempli au téléphone sur une 4G lente ne doit pas revenir refusé pour un
// indicatif oublié.
//
// La demande est ensuite traitée à la main : Maketou n'encaisse que dans un
// sens, aucun virement automatique n'existe. L'écran le dit plutôt que de
// laisser croire à un versement immédiat.

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { InputField, PasswordField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { CheckCircleIcon, InfoIcon } from '@/components/icons';
import { requestWithdrawal, setWithdrawalPin, type ApiPayoutRules } from '@/lib/deoflow/api';
import {
  PAYOUT_METHODS,
  isValidPayoutPhone,
  normalizePhone,
  type PayoutMethodId,
} from '@/lib/deoflow/payout';
import { formatAmount } from '@/lib/format';
import { errorMessage } from '@/lib/errorMessages';
import { cn } from '@/lib/cn';

const PIN_PATTERN = /^\d{4,6}$/;

export function WithdrawModal({
  open,
  onClose,
  availableFcfa,
  rules,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** Solde retirable, calculé par le serveur. Jamais recalculé ici. */
  availableFcfa: number;
  /** Règles lues sur le serveur : minimum, PIN exigé, PIN déjà défini. */
  rules: ApiPayoutRules;
  /** Appelé après une demande acceptée — la page recharge ses chiffres. */
  onDone: () => void;
}) {
  const [method, setMethod] = useState<PayoutMethodId>(PAYOUT_METHODS[0].id);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** Le PIN vient d'être créé dans cette session — la prop `rules` est périmée. */
  const [pinJustSet, setPinJustSet] = useState(false);

  const selected = PAYOUT_METHODS.find((m) => m.id === method) ?? PAYOUT_METHODS[0];
  const parsed = Number(amount);
  const cleanPhone = normalizePhone(phone);

  const hasPin = rules.hasPin || pinJustSet;
  // Créer le code AVANT de remplir le reste : sinon le créateur saisit tout,
  // envoie, et se fait renvoyer un PIN_NOT_SET qu'il ne peut pas corriger sans
  // quitter l'écran.
  const needsPinSetup = rules.requiresPin && !hasPin;

  // Un seul message à la fois, dans l'ordre où l'utilisateur remplit : lui
  // afficher trois reproches en même temps ne l'aide pas à corriger le premier.
  const blocker: string | null = (() => {
    if (availableFcfa <= 0) return 'Vous n’avez pas encore de commission à retirer.';
    if (availableFcfa < rules.minAmountFcfa) {
      return `Le retrait minimum est de ${formatAmount(rules.minAmountFcfa)}. Continuez à parrainer.`;
    }
    if (amount.trim() === '') return null;
    if (!Number.isInteger(parsed) || parsed <= 0) return 'Le montant doit être un nombre entier.';
    if (parsed < rules.minAmountFcfa) {
      return `Minimum ${formatAmount(rules.minAmountFcfa)} par retrait.`;
    }
    if (rules.maxAmountFcfa !== null && parsed > rules.maxAmountFcfa) {
      return `Maximum ${formatAmount(rules.maxAmountFcfa)} par retrait.`;
    }
    if (parsed > availableFcfa)
      return `Vous ne pouvez pas retirer plus de ${formatAmount(availableFcfa)}.`;
    if (cleanPhone === '') return null;
    if (!isValidPayoutPhone(cleanPhone)) {
      return `Numéro invalide — commencez par l’indicatif, ex. ${selected.dialCode}90123456.`;
    }
    if (rules.requiresPin && pin !== '' && !PIN_PATTERN.test(pin)) {
      return 'Le code de retrait fait 4 à 6 chiffres.';
    }
    return null;
  })();

  const ready =
    availableFcfa > 0 &&
    Number.isInteger(parsed) &&
    parsed >= rules.minAmountFcfa &&
    (rules.maxAmountFcfa === null || parsed <= rules.maxAmountFcfa) &&
    parsed <= availableFcfa &&
    isValidPayoutPhone(cleanPhone) &&
    (!rules.requiresPin || PIN_PATTERN.test(pin));

  function close() {
    if (busy) return;
    setError(null);
    setDone(false);
    // Le code n'est JAMAIS gardé en mémoire d'un passage à l'autre.
    setPin('');
    setNewPin('');
    onClose();
  }

  async function createPin(e: FormEvent) {
    e.preventDefault();
    if (!PIN_PATTERN.test(newPin)) return;
    setError(null);
    setBusy(true);
    try {
      await setWithdrawalPin(newPin);
      setPinJustSet(true);
      // Il sert immédiatement pour la demande qui suit — pas de seconde saisie.
      setPin(newPin);
      setNewPin('');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    setBusy(true);
    try {
      await requestWithdrawal({
        amount: parsed,
        destination: { method, phone: cleanPhone },
        ...(rules.requiresPin ? { pin } : {}),
      });
      setDone(true);
      setAmount('');
      setPin('');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Étape préalable : créer le code de retrait. Il protège l'argent contre
  // quelqu'un qui trouverait une session ouverte sur un téléphone posé.
  if (needsPinSetup) {
    return (
      <Modal open={open} onClose={close} title="Créez votre code de retrait">
        <form onSubmit={createPin} className="flex flex-col gap-4">
          <p className="text-sm text-ink-500">
            Un code à 4 à 6 chiffres, demandé à chaque retrait. Il empêche quelqu’un qui trouverait
            votre téléphone déverrouillé d’envoyer votre argent ailleurs.
          </p>

          <PasswordField
            label="Votre code"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            placeholder="••••"
            hint="4 à 6 chiffres. Notez-le : il n’est pas récupérable, seulement remplaçable."
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
          />

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close} className="flex-1">
              Annuler
            </Button>
            <Button
              type="submit"
              variant="ember"
              loading={busy}
              disabled={!PIN_PATTERN.test(newPin)}
              className="flex-1"
            >
              Créer mon code
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title="Retirer mes commissions">
      {done ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-gain-50 text-gain-600">
            <CheckCircleIcon className="size-7" />
          </span>
          <div>
            <p className="font-display text-base">Demande enregistrée</p>
            <p className="mt-1 text-sm text-ink-500">
              Elle apparaît maintenant en attente de validation. Le versement est effectué
              manuellement sur votre {selected.label}.
            </p>
          </div>
          <Button variant="secondary" onClick={close} className="w-full">
            Fermer
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="rounded-xl bg-sunken p-3">
            <p className="text-xs text-ink-500">Disponible</p>
            <p className="font-display text-xl text-ember-600 tabular-nums">
              {formatAmount(availableFcfa)}
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-ink-700">Moyen de paiement</legend>
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Moyen de paiement"
            >
              {PAYOUT_METHODS.map((option) => {
                const active = option.id === method;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMethod(option.id)}
                    className={cn(
                      'pressable flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-xl border px-3 py-2 text-left',
                      active
                        ? 'border-ink-900 bg-ink-900 text-white'
                        : 'border-line bg-surface text-ink-700 hover:border-line-strong',
                    )}
                  >
                    <span className="w-full truncate text-sm font-medium">{option.label}</span>
                    <span
                      className={cn(
                        'w-full truncate text-[0.6875rem]',
                        active ? 'text-white/70' : 'text-ink-300',
                      )}
                    >
                      {option.country}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <InputField
            label="Numéro de téléphone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={`${selected.dialCode}90123456`}
            hint="Le numéro qui recevra l’argent, indicatif compris."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <InputField
            label="Montant"
            type="number"
            inputMode="numeric"
            min={rules.minAmountFcfa}
            max={availableFcfa}
            step={1}
            placeholder="0"
            aside="FCFA"
            hint={`Minimum ${formatAmount(rules.minAmountFcfa)} par retrait.`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          {rules.requiresPin && (
            <PasswordField
              label="Code de retrait"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          )}

          {/* Raccourci : sur téléphone, saisir « 7500 » au clavier numérique est
              la friction principale de ce formulaire. */}
          {availableFcfa >= rules.minAmountFcfa && (
            <button
              type="button"
              onClick={() => setAmount(String(availableFcfa))}
              className="pressable w-fit cursor-pointer text-xs text-ember-600 hover:underline"
            >
              Retirer tout ({formatAmount(availableFcfa)})
            </button>
          )}

          {error && <Alert tone="error">{error}</Alert>}
          {!error && blocker && <p className="text-xs text-ink-500">{blocker}</p>}

          <p className="flex items-start gap-2 rounded-xl bg-sunken p-3 text-xs text-ink-500">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-ink-300" />
            Les versements sont traités à la main, sous quelques jours ouvrés. Vous serez prévenu
            dès que l’argent part.
          </p>

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close} className="flex-1">
              Annuler
            </Button>
            <Button
              type="submit"
              variant="ember"
              loading={busy}
              disabled={!ready}
              className="flex-1"
            >
              {busy ? 'Envoi…' : 'Demander'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
