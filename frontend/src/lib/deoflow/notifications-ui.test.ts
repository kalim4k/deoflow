import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une notification invisible n'existe pas.
 *
 * La route `/api/notifications/count` a vécu des mois sans que rien ne
 * l'appelle : elle avait été écrite pour une pastille jamais posée. Tout
 * fonctionnait — le serveur écrivait les notifications, la page les affichait —
 * mais le créateur n'avait aucun moyen d'apprendre qu'il en avait une, sauf à
 * ouvrir la page au hasard.
 *
 * C'est le pire genre de défaut : chaque pièce passe son test, et la chaîne ne
 * sert à rien. D'où ces vérifications de câblage, qui ne portent sur aucune
 * pièce mais sur ce qui les relie.
 */
const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('le compteur de non-lues est branché', () => {
  it('quelqu’un consomme réellement /api/notifications/count', () => {
    const ctx = read('src', 'contexts', 'NotificationsContext.tsx');
    expect(ctx).toContain('/api/notifications/count');
  });

  it('le fournisseur est monté dans la mise en page racine', () => {
    // Sans ça le contexte existe, compile, et renvoie 0 pour toujours.
    const layout = read('src', 'app', 'layout.tsx');
    expect(layout).toContain('NotificationsProvider');
  });

  it('le rail et la cloche lisent le même compteur', () => {
    for (const file of [
      ['src', 'components', 'app', 'Sidebar.tsx'],
      ['src', 'components', 'app', 'NotificationBell.tsx'],
    ]) {
      expect(read(...file), file.join('/')).toContain('useNotifications');
    }
  });

  it('la cloche est présente dans l’en-tête mobile', () => {
    // Sous `lg` le rail est masqué : sans la cloche, les notifications ne sont
    // atteignables qu'en ouvrant le tiroir, donc en sachant déjà y aller.
    const shell = read('src', 'components', 'app', 'AppShell.tsx');
    expect(shell).toContain('<NotificationBell />');
  });

  it('lire une notification rafraîchit le compteur', () => {
    // Sinon la pastille garde son ancien chiffre jusqu'au prochain sondage :
    // on a tout lu et le menu annonce encore des non-lues. C'est ce détail qui
    // décide si la pastille est crédible ou si on apprend à l'ignorer.
    const page = read('src', 'app', 'notifications', 'page.tsx');
    expect(page).toContain('refreshUnread');
    // Les deux chemins de lecture, pas seulement « tout marquer ».
    expect((page.match(/refreshUnread\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('le sondage reste économe', () => {
  const CTX = read('src', 'contexts', 'NotificationsContext.tsx');

  it('rien n’est sondé quand l’onglet est masqué', () => {
    // La cible est en 4G instable et payée au volume : sonder un onglet que
    // personne ne regarde dépense son forfait pour rien.
    expect(CTX).toContain('visibilityState');
    expect(CTX).toContain('visibilitychange');
  });

  it('rien n’est sondé sans session', () => {
    expect(CTX).toMatch(/if\s*\(!userId\)/);
  });

  it('l’intervalle est nettoyé au démontage', () => {
    // Un intervalle qui survit accumule un sondeur par montage.
    expect(CTX).toContain('clearInterval');
  });

  it('un échec réseau ne remet pas le compteur à zéro', () => {
    // Remettre à 0 sur un créneau réseau ferait disparaître une pastille
    // légitime — l'utilisateur croirait avoir tout lu.
    const guard = CTX.slice(CTX.indexOf('} catch {'), CTX.indexOf('}, [userId]);'));
    expect(guard).not.toContain('setUnread(0)');
  });
});
