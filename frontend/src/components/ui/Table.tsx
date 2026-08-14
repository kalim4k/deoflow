import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tableau dense du back-office : lignes compactes, en-tête collant, et
 * conteneur à défilement horizontal pour qu'un tableau large ne fasse jamais
 * défiler la page latéralement sur mobile.
 */
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('card overflow-x-auto', className)}>
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-10 bg-surface/95 px-4 py-3 text-xs font-semibold tracking-wider text-ink-300 uppercase backdrop-blur',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3 align-middle text-ink-700', className)} {...props}>
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={cn(
        'border-t border-line transition-colors duration-200 hover:bg-sunken',
        className,
      )}
    >
      {children}
    </tr>
  );
}
