"use client";

import { useState, useTransition } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function EstimateApprovalForm({
  estimateId,
  customerName,
}: {
  estimateId: string;
  customerName?: string;
}) {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (accepted) {
    return <p className="text-xs font-semibold text-green">Approved. The office can now schedule the work.</p>;
  }

  return (
    <div className="grid gap-2">
      {error ? <p className="text-xs text-red">{error}</p> : null}
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await api.acceptEstimate(estimateId, { customerName });
              setAccepted(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not approve estimate");
            }
          });
        }}
      >
        {pending ? "Approving..." : "Approve estimate"}
      </Button>
    </div>
  );
}
