import type { ReactNode } from 'react';

export function AdminPageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-[1.75rem] sm:text-4xl">{title}</h1>
        {description ? (
          <p className="max-w-xl text-sm text-ink-500 sm:text-base">{description}</p>
        ) : null}
      </div>
      {children}
    </header>
  );
}
