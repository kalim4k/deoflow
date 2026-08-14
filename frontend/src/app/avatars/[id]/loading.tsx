// Affiché par Next pendant qu'il charge le code de cette route.
//
// C'est ce qui supprime le temps mort entre le clic sur un personnage et
// l'apparition de sa fiche : sans ce fichier, l'écran précédent reste figé
// jusqu'à ce que le segment soit prêt, et seule la barre de progression en haut
// signale qu'il se passe quelque chose.
//
// Le même squelette est réaffiché par la page pendant l'appel à l'API : le
// relais est invisible, l'utilisateur ne voit qu'un seul état d'attente.

import { AvatarDetailSkeleton } from '@/components/app/AvatarDetailSkeleton';

export default function Loading() {
  return <AvatarDetailSkeleton />;
}
