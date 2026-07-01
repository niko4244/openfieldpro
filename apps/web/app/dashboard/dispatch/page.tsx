// Phase 7 dispatch page — server:dispatcher+owner role. Rendered as a
// client component because the JWT lives in `localStorage` and server
// fetchers can't see it (same reason mid-tier client wrappers fetch on
// mount everywhere else in this app).
import { DispatchBoard } from "@/components/dispatch-board";

export default function DispatchPage() {
  return <DispatchBoard />;
}
