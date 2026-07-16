import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BULK_ADVISORY_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

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
  if (blocking.length > 0) {
    for (const advisory of blocking) {
      console.error(`${advisory.severity.toUpperCase()} ${advisory.packageName}: ${advisory.title} (${advisory.url})`);
    }
    throw new Error(`${blocking.length} high or critical dependency advisory finding(s)`);
  }

  const total = Object.values(advisories).reduce((count, rows) => count + rows.length, 0);
  console.log(`Dependency audit passed: ${Object.keys(packages).length} packages checked; ${total} non-blocking advisory finding(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
