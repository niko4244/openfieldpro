// Phase 7 tech-mode page \u2014 mobile-first view a technician keeps open while
// they're in the field. All the GPS handling lives in <TechTracker/>
// (it's the only place that needs the "use client" directive; this page
// stays a server component for fast initial render).
import { TechTracker } from "@/components/tech-tracker";

export default function TechPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <TechTracker />
    </div>
  );
}
