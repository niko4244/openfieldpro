import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-3xl mb-3 opacity-30">◇</div>
      <p className="text-sm text-fg-muted font-medium">{title}</p>
      {description && <p className="text-xs text-fg-dim mt-1">{description}</p>}
      {actions && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
