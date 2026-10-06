import type { CreditPack } from './types';
import { CREDIT_FCFA } from './pricing';

// Le crédit s'achète au même prix que chez kie.ai : 5 $ pour 1000 crédits,
// soit 3000 FCFA. Aucun pack ne remise ce tarif — la marge se prend sur la
// consommation (3× le coût fournisseur, voir `pricing.ts`), pas sur la vente
// du crédit. Une remise à l'achat viendrait donc directement rogner cette
// marge, sans que rien ne le signale.
//
// Les paliers n'existent que pour proposer des tickets adaptés à des usages
// différents : essayer, produire régulièrement, produire beaucoup.
//
// Les packs partent du PRIX, montant rond que l'acheteur voit et paie ; les
// crédits s'en déduisent. 20 000 FCFA ne se divise pas par 3 : on arrondit au
// crédit supérieur, en faveur de l'acheteur (6 667 crédits, soit un crédit
// offert). Arrondir vers le bas lui ferait payer 2 FCFA de vent.
function byPrice(id: string, name: string, priceFcfa: number, badge: string | null): CreditPack {
  return { id, name, priceFcfa, credits: Math.ceil(priceFcfa / CREDIT_FCFA), badge };
}

export const CREDIT_PACKS: CreditPack[] = [
  byPrice('starter', 'Pack Starter', 9_000, null),
  byPrice('createur', 'Pack Créateur', 20_000, 'Populaire'),
  byPrice('pro', 'Pack Pro', 30_000, 'Pour production intensive'),
];

/** Prix unitaire arrondi au franc — identique sur tous les packs. */
export function pricePerCredit(pack: CreditPack): number {
  return Math.round(pack.priceFcfa / pack.credits);
}

export function findPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}
