import * as React from "react";
import { cn } from "@/lib/utils";

// Lightweight "nothing here yet" block. Used inside Cards and panels when
// the underlying data is empty or no preview has been rendered yet.
export interface EmptyStateProps {
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, className, action }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-4 py-8",
        className,
      )}
    >
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && (
        <p className="text-xs text-fg-muted mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
