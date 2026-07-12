import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <div>
      <PageHeader
        title="Access restricted"
        description="This workspace is not available to your current role."
      />
      <Card className="max-w-2xl border-yellow/30 bg-yellow/5">
        <CardContent className="p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow/10 text-xl text-yellow">
            !
          </div>
          <h2 className="mt-4 text-lg font-bold text-fg">Your session is valid, but this page is office-restricted.</h2>
          <p className="mt-2 text-sm leading-6 text-fg-muted">
            OpenFieldPro separates assigned field work from dispatch, billing, reporting,
            integrations, and owner administration. Ask an owner or dispatcher when an
            office action is required.
          </p>
          {from && (
            <p className="mt-4 rounded-lg border border-border bg-surface-200 px-3 py-2 font-mono text-xs text-fg-dim">
              Blocked route: {from}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/">
              <Button>Open Today</Button>
            </Link>
            <Link href="/jobs">
              <Button variant="secondary">Open assigned jobs</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
