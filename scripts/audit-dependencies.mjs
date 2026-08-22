import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BULK_ADVISORY_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const EXCEPTIONS_URL = new URL("../docs/release/dependency-advisories.json", import.meta.url);

export function packagesFromLockfile(lockfile) {
  const section = lockfile.match(/(?:^|\n)packages:\s*\n([\s\S]*?)(?:\n)\s*snapshots:\s*\n/);
  if (!section) throw new Error("pnpm-lock.yaml does not contain packages and snapshots sections");

  const packages = {};
  for (const match of section[1].matchAll(/^  (?:'([^']+)'|([^'\n][^\n]*)):\s*$/gm)) {
    const key = match[1] ?? match[2];
    const separator = key.lastIndexOf("@");
    if (separator <= 0) continue;
    const name = key.slice(0, separator);
    const version = key.slice(separator + 1);
    if (!name || !/^\d+\.\d+\.\d+/.test(version)) continue;
    (packages[name] ??= new Set()).add(version);
  }

  const result = Object.fromEntries(
    Object.entries(packages).map(([name, versions]) => [name, [...versions].sort()]),
  );
  if (Object.keys(result).length === 0) throw new Error("No registry packages found in pnpm-lock.yaml");
  return result;
}

export function blockingAdvisories(response) {
  return Object.entries(response).flatMap(([packageName, advisories]) =>
    advisories
      .filter((advisory) => BLOCKING_SEVERITIES.has(advisory.severity))
      .map((advisory) => ({ packageName, ...advisory })),
  );
}

function ghsaOf(finding) {
  return (finding.url?.match(/GHSA-[a-z0-9-]+/i) ?? [])[0] ?? null;
}

export function loadExceptions(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("exceptions file must be a JSON array");
  for (const record of parsed) {
    for (const field of ["ghsa", "package", "version", "rationale", "compensatingControl", "owner", "expiresAt"]) {
      if (typeof record[field] !== "string" || record[field].trim() === "") {
        throw new Error(`dependency exception is missing a non-empty "${field}" field`);
      }
    }
  }
  return parsed;
}

/**
 * Removes blocking findings covered by documented, unexpired exceptions and
 * fails loudly when an exception is stale, expired, or references a version
 * that left the lockfile, so exceptions are removed once a fix lands.
 */
export function applyExceptions(blocking, exceptions, packages, now = new Date()) {
  const byGhsa = new Map();
  for (const record of exceptions) {
    if (byGhsa.has(record.ghsa)) throw new Error(`duplicate exception for ${record.ghsa}`);
    byGhsa.set(record.ghsa, record);
  }
  const applied = [];
  const remaining = [];
  for (const finding of blocking) {
    const ghsa = ghsaOf(finding);
    const record = ghsa ? byGhsa.get(ghsa) : undefined;
    if (!record) {
      remaining.push(finding);
      continue;
    }
    if (new Date(record.expiresAt) <= now) {
      throw new Error(`exception for ${record.ghsa} expired on ${record.expiresAt}; review and renew or remove it`);
    }
    const versions = packages[record.package] ?? [];
    if (!versions.includes(record.version)) {
      throw new Error(
        `exception for ${record.ghsa} references ${record.package}@${record.version}, which is no longer in the lockfile; remove the exception`,
      );
    }
    applied.push(record);
  }
  const stale = exceptions.filter((record) => !applied.includes(record));
  if (stale.length > 0) {
    throw new Error(
      `stale dependency exception${stale.length > 1 ? "s" : ""} ${stale
        .map((record) => record.ghsa)
        .join(", ")} no longer match a blocking advisory; remove the exception`,
    );
  }
  return { remaining, applied };
}

async function main() {
  const packages = packagesFromLockfile(await readFile("pnpm-lock.yaml", "utf8"));
  const response = await fetch(BULK_ADVISORY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "OpenFieldPro release audit",
    },
    body: JSON.stringify(packages),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Dependency advisory service returned HTTP ${response.status}`);

  const advisories = await response.json();
  const blocking = blockingAdvisories(advisories);
  const exceptions = loadExceptions(await readFile(EXCEPTIONS_URL, "utf8"));
  const { remaining, applied } = applyExceptions(blocking, exceptions, packages);
  for (const record of applied) {
    console.log(`accepted exception ${record.ghsa} (${record.package}@${record.version}) until ${record.expiresAt}`);
  }
  if (remaining.length > 0) {
    for (const advisory of remaining) {
      console.error(`${advisory.severity.toUpperCase()} ${advisory.packageName}: ${advisory.title} (${advisory.url})`);
    }
    throw new Error(`${remaining.length} high or critical dependency advisory finding(s)`);
  }

  const total = Object.values(advisories).reduce((count, rows) => count + rows.length, 0);
  console.log(`Dependency audit passed: ${Object.keys(packages).length} packages checked; ${total} advisory finding(s), ${applied.length} accepted.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
