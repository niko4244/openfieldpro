import { readFileSync } from "node:fs";

export interface MaintenanceState {
  active: boolean;
}

export interface MaintenanceReader {
  read(): MaintenanceState;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_MUTATIONS = new Set([
  "POST /api/auth/login",
  "POST /api/operations/maintenance/exit",
]);

export function isMutatingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isMaintenanceExempt(method: string, pathname: string): boolean {
  return EXEMPT_MUTATIONS.has(`${method.toUpperCase()} ${pathname}`);
}

export class FileMaintenanceReader implements MaintenanceReader {
  constructor(readonly path: string) {}

  read(): MaintenanceState {
    try {
      const value: unknown = JSON.parse(readFileSync(this.path, "utf8"));
      if (
        !value ||
        typeof value !== "object" ||
        (value as { version?: unknown }).version !== 1 ||
        typeof (value as { active?: unknown }).active !== "boolean"
      ) {
        throw new Error("invalid maintenance state");
      }
      return { active: (value as { active: boolean }).active };
    } catch {
      return { active: true };
    }
  }
}

export function maintenanceReaderFromEnvironment(): MaintenanceReader {
  const path = process.env.OFP_MAINTENANCE_FILE;
  return path
    ? new FileMaintenanceReader(path)
    : { read: () => ({ active: false }) };
}

export class WorkerDrainTracker {
  #activeJobs = 0;

  constructor(readonly maintenance: MaintenanceReader) {}

  begin(): (() => void) | undefined {
    if (this.maintenance.read().active) return undefined;
    this.#activeJobs++;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.#activeJobs--;
    };
  }

  status(): { activeJobs: number; drained: boolean; maintenance: boolean } {
    const maintenance = this.maintenance.read().active;
    return {
      activeJobs: this.#activeJobs,
      drained: maintenance && this.#activeJobs === 0,
      maintenance,
    };
  }
}
