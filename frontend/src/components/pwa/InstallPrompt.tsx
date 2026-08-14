'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import icon from '@/components/brand/deoflow-icon.png';
import { Button } from '@/components/ui/Button';
import { CloseIcon } from '@/components/icons';

/**
 * Invite à installer Deoflow sur l'écran d'accueil.
 *
 * Deux chemins, parce que les plateformes ne se ressemblent pas :
 *
 *   • **Android / Chrome** émet `beforeinstallprompt`. On l'intercepte, on
 *     garde l'événement, et on déclenche la vraie boîte de dialogue du système
 *     au moment choisi par l'utilisateur. C'est la seule façon d'installer :
 *     l'événement ne peut être rejoué qu'une fois, et seulement depuis un geste.
 *
 *   • **iOS** n'a pas cet événement, et n'en aura pas. L'installation passe
 *     obligatoirement par « Partager → Sur l'écran d'accueil ». On affiche donc
 *     la marche à suivre, sans bouton qui mentirait sur ce qu'il fait.
 *
 * Le refus est mémorisé pour {@link DISMISS_DAYS} jours. Une invite qui revient
 * à chaque page apprend surtout à fermer sans lire.
 */

/** Réponse de `prompt()`. Absente de lib.dom : l'API n'est pas standardisée. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'deoflow:pwa-dismissed-at';
const DISMISS_DAYS = 14;

/**
 * Délai avant affichage. Une invite qui surgit pendant que la page se dessine
 * est perçue comme une publicité et se ferme par réflexe — avant même d'avoir
 * été lue.
 */
const DELAY_MS = 5_000;

function dismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    // Navigation privée : `localStorage` peut lever. On préfère afficher une
    // fois de trop que planter le rendu.
    return false;
  }
}

/** Déjà installée : l'application tourne dans sa propre fenêtre. */
function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Safari iOS n'implémente pas `display-mode` et expose ce drapeau non standard.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = useCallback((remember: boolean) => {
    setVisible(false);
    if (!remember) return;
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* navigation privée — rien à faire */
    }
  }, []);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const onBeforeInstall = (event: Event) => {
      // Empêche la bannière native de Chrome : on veut choisir le moment.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      timer = setTimeout(() => setVisible(true), DELAY_MS);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS n'émettra jamais l'événement : on programme l'aide directement.
    if (isIOS()) {
      setIosHint(true);
      timer = setTimeout(() => setVisible(true), DELAY_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // L'événement n'est utilisable qu'une fois, accepté ou non.
      setDeferred(null);
      // Un refus se mémorise ; une acceptation n'a pas besoin de l'être,
      // `appinstalled` ferme l'invite et `isStandalone` la bloquera ensuite.
      close(outcome === 'dismissed');
    } catch {
      close(false);
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Installer l’application"
      className={[
        'fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96',
        'card flex flex-col gap-3 p-4 shadow-lg',
        // Animation maison de globals.css. La règle globale
        // `prefers-reduced-motion` y ramène déjà la durée à ~0 : l'invite
        // apparaît alors directement, sans glissement et sans disparaître.
        'rise-in',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <Image src={icon} alt="" width={40} height={40} className="size-10 shrink-0" />

        <div className="flex-1">
          <p className="font-display font-semibold text-ink-900">Installer Deoflow</p>
          <p className="mt-0.5 text-sm text-ink-500">
            {iosHint
              ? 'Ajoutez Deoflow à votre écran d’accueil : appuyez sur Partager, puis « Sur l’écran d’accueil ».'
              : 'Accédez à vos générations depuis votre écran d’accueil, sans passer par le navigateur.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => close(true)}
          aria-label="Ne plus proposer"
          className="pressable -m-1 grid size-9 cursor-pointer place-items-center rounded-lg text-ink-500 hover:bg-sunken hover:text-ink-900"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      {!iosHint && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => close(true)}>
            Plus tard
          </Button>
          <Button variant="ember" onClick={() => void install()} loading={busy}>
            Installer
          </Button>
        </div>
      )}
    </div>
  );
}
