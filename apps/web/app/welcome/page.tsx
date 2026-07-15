import Link from "next/link";

const operations = [
  ["CRM and equipment history", "Customers, properties, appliances, notes, photos, and complete service history."],
  ["Scheduling and dispatch", "Appointments, technician assignment, job status, route context, and return visits."],
  ["Estimate to payment", "Price book, estimates, approvals, invoices, offline payments, and optional card checkout."],
  ["Customer lifecycle", "Documents, review follow-up, service plans, reminders, and customer-facing records."],
  ["Business control", "Reporting, margins, organization branding, integrations, backups, and self-hosting."],
];

const diagnosticFlow = [
  "Link the work order to the exact appliance",
  "Confirm model, serial, and workflow applicability",
  "Start from the complaint, error code, component, or circuit",
  "Perform exact checks with meter points and operating conditions",
  "Record the actual reading before the workflow branches",
  "Keep the supporting wiring path and source revision visible",
  "Finish with a defensible repair, no-fix, or escalation record",
];

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-surface-100 text-fg">
      <header className="sticky top-0 z-50 border-b border-border bg-surface-100/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-[min(1180px,calc(100%-32px))] items-center gap-5">
          <Link href="/welcome" className="flex items-center gap-3 text-fg no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-xs font-black text-white">OF</span>
            <div>
              <span className="block font-black tracking-tight">OpenFieldPro</span>
              <span className="block text-[10px] text-fg-dim">Open field service operations</span>
            </div>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-semibold text-fg-muted md:flex">
            <a href="#operations">Operations</a>
            <a href="#diagnostics">Diagnostics</a>
            <a href="#trust">Trust model</a>
            <a href="#deploy">Self-host</a>
          </nav>
          <Link href="/login" className="rounded-full bg-accent px-4 py-2 text-sm font-black text-white no-underline hover:bg-accent-hover">
            Open app
          </Link>
        </div>
      </header>

      <section className="overflow-hidden border-b border-border bg-gradient-to-br from-surface-100 via-surface-50 to-surface-100">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-12 py-20 lg:grid-cols-[.95fr_1.05fr] lg:items-center lg:py-28">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-accent">
              Operations core + diagnostic execution
            </p>
            <h1 className="max-w-4xl text-6xl font-black leading-[.88] tracking-[-0.075em] text-fg md:text-8xl">
              Run the business. Execute the diagnosis.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-fg-muted md:text-xl">
              OpenFieldPro is a self-hostable field service platform with the complete operational workflow service companies expect—plus appliance-specific diagnostic execution that connects the complaint, exact test points, measured readings, and wiring evidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-full bg-accent px-5 py-3 text-sm font-black text-white no-underline hover:bg-accent-hover">
                Open the product
              </Link>
              <a href="https://github.com/niko4244/openfieldpro" target="_blank" rel="noopener noreferrer" className="rounded-full border border-border bg-surface-50 px-5 py-3 text-sm font-bold text-fg no-underline hover:bg-surface-200">
                View repository
              </a>
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                "Open source",
                "Self-hostable",
                "No telemetry required",
                "Appliance diagnostic core",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-surface-50 p-3 text-center font-semibold text-fg-muted">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-border bg-surface-50 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-accent">Today’s field command</p>
                <p className="mt-1 text-xl font-black text-fg">Next visit and diagnostic state</p>
              </div>
              <span className="rounded-full bg-green/10 px-3 py-1 text-xs font-bold text-green">Synced</span>
            </div>
            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl border border-border bg-surface-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-fg-dim">9:30 AM · Refrigerator</p>
                    <p className="mt-2 text-lg font-black text-fg">Not cooling in fresh-food section</p>
                    <p className="mt-1 text-sm text-fg-muted">Model and serial confirmed · validated workflow downloaded</p>
                  </div>
                  <span className="rounded-full bg-blue/10 px-3 py-1 text-xs font-bold text-blue">Testing</span>
                </div>
                <div className="mt-5 rounded-xl border border-accent/30 bg-accent/5 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-accent">Active check</p>
                  <p className="mt-2 font-bold text-fg">Verify evaporator-fan supply under cooling command</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-surface-100 p-3"><span className="text-fg-dim">Point 1</span><p className="mt-1 font-semibold text-fg">Control P8-3</p></div>
                    <div className="rounded-lg bg-surface-100 p-3"><span className="text-fg-dim">Point 2</span><p className="mt-1 font-semibold text-fg">Neutral reference</p></div>
                    <div className="rounded-lg bg-surface-100 p-3"><span className="text-fg-dim">Condition</span><p className="mt-1 font-semibold text-fg">Cooling active</p></div>
                    <div className="rounded-lg bg-surface-100 p-3"><span className="text-fg-dim">Expected</span><p className="mt-1 font-semibold text-fg">120 VAC</p></div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[["4", "visits today"], ["2", "active diagnostics"], ["$1.8k", "open estimates"]].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-border bg-surface-200 p-4 text-center">
                    <p className="text-2xl font-black text-fg">{value}</p>
                    <p className="mt-1 text-xs text-fg-muted">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="operations" className="border-b border-border py-20">
        <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[.2em] text-blue">Complete operations core</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-fg md:text-6xl">The business system is not an afterthought.</h2>
            <p className="mt-5 text-lg leading-8 text-fg-muted">
              OpenFieldPro retains the full work-order and customer lifecycle expected from a modern field service platform. Diagnostic execution is integrated into that lifecycle instead of replacing it.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {operations.map(([title, description]) => (
              <article key={title} className="rounded-3xl border border-border bg-surface-50 p-6">
                <p className="text-lg font-black text-fg">{title}</p>
                <p className="mt-3 text-sm leading-6 text-fg-muted">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="diagnostics" className="border-b border-border bg-surface-50 py-20">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-accent">Appliance-specific differentiator</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-fg md:text-6xl">Technical information becomes an executable workflow.</h2>
            <p className="mt-5 text-lg leading-8 text-fg-muted">
              Static manuals, error-code tables, and wiring diagrams remain the evidence. OpenFieldPro connects them into a field-ready sequence without hiding the meter points, operating conditions, measured values, or route validation.
            </p>
          </div>
          <div className="grid gap-3">
            {diagnosticFlow.map((step, index) => (
              <div key={step} className="flex items-center gap-4 rounded-2xl border border-border bg-surface-100 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 font-black text-accent">{index + 1}</span>
                <p className="font-semibold text-fg">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="border-b border-border py-20">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-6 lg:grid-cols-3">
          {[
            ["Explicit support status", "Validated, pilot, experimental, unsupported, suspended, and retired states remain visible. A missing workflow is never disguised as an answer."],
            ["Publication gates", "Executable checks require exact points, operating conditions, expected results, validated continuity, and a passed visual trace audit."],
            ["Field correction loop", "Technicians can report endpoint, route, reading, branch, usability, or safety defects. Safety-critical reports suspend the workflow pending review."],
          ].map(([title, copy]) => (
            <article key={title} className="rounded-3xl border border-border bg-surface-50 p-6">
              <p className="text-xl font-black text-fg">{title}</p>
              <p className="mt-3 text-sm leading-6 text-fg-muted">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="deploy" className="py-20">
        <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-col items-start justify-between gap-8 rounded-[2rem] border border-accent/25 bg-accent/5 p-8 lg:flex-row lg:items-center lg:p-12">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[.2em] text-accent">Own the deployment</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-fg">Run it yourself. Keep control of the data.</h2>
            <p className="mt-4 text-lg leading-8 text-fg-muted">
              PostgreSQL, Fastify, Next.js, Expo, Redis, object storage, and container deployment remain part of the open product foundation.
            </p>
          </div>
          <a href="https://github.com/niko4244/openfieldpro" target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-black text-white no-underline hover:bg-accent-hover">
            Review the code
          </a>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-wrap items-center justify-between gap-3 text-sm text-fg-dim">
          <span>OpenFieldPro</span>
          <span>Open field service operations with visible diagnostic evidence.</span>
        </div>
      </footer>
    </main>
  );
}
