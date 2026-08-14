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
export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'starter',
    name: 'Pack Starter',
    credits: 1000,
    priceFcfa: 1000 * CREDIT_FCFA,
    badge: null,
  },
  {
    id: 'createur',
    name: 'Pack Créateur',
    credits: 3000,
    priceFcfa: 3000 * CREDIT_FCFA,
    badge: 'Populaire',
  },
  {
    id: 'pro',
    name: 'Pack Pro',
    credits: 10000,
    priceFcfa: 10000 * CREDIT_FCFA,
    badge: 'Pour production intensive',
  },
];

/** Prix unitaire arrondi au franc — identique sur tous les packs. */
export function pricePerCredit(pack: CreditPack): number {
  return Math.round(pack.priceFcfa / pack.credits);
}

export function findPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}
