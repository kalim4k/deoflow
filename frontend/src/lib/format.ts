// Display formatters — French locale, zero-decimal currencies first.
//
// Amounts crossing the API are integers in the smallest currency unit
// (XOF/FCFA has no minor unit; USD/EUR are cents). Anything that renders an
// amount goes through `formatAmount` so the decimal handling lives in one
// place instead of being re-derived per page.

const ZERO_DECIMAL = new Set(['XOF', 'XAF', 'JPY', 'KRW', 'CLP', 'VND']);

export function formatAmount(minorUnits: number, currency = 'XOF'): string {
  const upper = currency.toUpperCase();
  const isZeroDecimal = ZERO_DECIMAL.has(upper);
  const value = isZeroDecimal ? minorUnits : minorUnits / 100;
  const digits = isZeroDecimal ? 0 : 2;

  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: upper,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    // Unknown ISO code — fall back to a plain number + suffix.
    return `${new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)} ${upper}`;
  }
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** "il y a 3 minutes" — for notification feeds. */
export function formatRelative(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';

  const seconds = Math.round((d.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return rtf.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return rtf.format(seconds, 'second');
}
