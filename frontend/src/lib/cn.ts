import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names, letting later Tailwind utilities win over
 * earlier conflicting ones (`cn('px-2', 'px-4')` → `'px-4'`). Used by every
 * UI primitive so callers can override a default with a plain `className`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
