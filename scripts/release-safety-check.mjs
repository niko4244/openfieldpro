#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const passes = [];

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function requireFile(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) fail(`required file missing: ${path}`);
  else pass(`required file present: ${path}`);
}

const requiredFiles = [
  "LICENSE",
  "SECURITY.md",
  ".github/FUNDING.yml",
  "pnpm-lock.expected.sha256",
  "scripts/verify-lockfile.mjs",
  "docs/funding/SPONSORSHIP_PLAYBOOK.md",
  "docs/security/KEY_MANAGEMENT.md",
  "docs/release/RELEASE_CHECKLIST.md",
  "apps/api/src/license-keys.ts",
  "apps/api/scripts/make-license-key.ts",
  "apps/api/scripts/verify-license-key.ts",
];
requiredFiles.forEach(requireFile);

let tracked = [];
try {
  tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  pass(`inspected ${tracked.length} tracked files`);
} catch (error) {
  fail(`unable to list tracked files: ${error instanceof Error ? error.message : String(error)}`);
}

const forbiddenTrackedNames = tracked.filter((file) => {
  if (file === ".env.example") return false;
  return (
    file === ".env" ||
    file.startsWith(".env.") ||
    file.startsWith(".secrets/") ||
    file.endsWith(".private.pem") ||
    file.endsWith(".ofp-license") ||
    /(?:^|\/)license-signing-key\.pem$/i.test(file) ||
    /(?:^|\/)ofp-license-private\.pem$/i.test(file)
  );
});
if (forbiddenTrackedNames.length) fail(`sensitive files are tracked: ${forbiddenTrackedNames.join(", ")}`);
else pass("no tracked environment, private-key, or entitlement files");

const binaryExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".woff", ".woff2", ".ttf", ".mp4",
]);
const secretPatterns = [
  ["private key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ["GitHub access token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
];
const secretFindings = [];
const textFiles = [];
for (const file of tracked) {
  if (file === "scripts/release-safety-check.mjs" || binaryExtensions.has(extname(file).toLowerCase())) continue;
  const absolute = resolve(root, file);
  if (!existsSync(absolute) || statSync(absolute).size > 1_000_000) continue;
  let content;
  try {
    content = readFileSync(absolute, "utf8");
  } catch {
    continue;
  }
  textFiles.push({ file, content });
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) secretFindings.push(`${label} in ${file}`);
  }
}
if (secretFindings.length) fail(`possible committed secrets: ${secretFindings.join("; ")}`);
else pass("tracked-text secret pattern scan passed");

const directCompetitorPattern = /housecall\s*pro/i;
const competitorMentions = textFiles
  .filter(({ content }) => directCompetitorPattern.test(content))
  .map(({ file }) => file);
if (competitorMentions.length) fail(`direct competitor naming remains in: ${competitorMentions.join(", ")}`);
else pass("public repository copy remains vendor-neutral");

/**
 * Returns every mutable action reference in a workflow file. Pinned means a
 * 40-hex commit SHA, a local "./path" action, or a docker image with a
 * sha256 digest. Anything else (tag, branch, digest-less docker image) can be
 * retargeted by an attacker or a moved tag, so it fails the release gate.
 */
export function findUnpinnedActions(content) {
  const unpinned = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)/);
    if (!match) continue;
    const ref = match[1];
    if (ref.startsWith("./")) continue;
    const at = ref.lastIndexOf("@");
    const version = at === -1 ? "" : ref.slice(at + 1);
    if (/^[0-9a-f]{40}$/.test(version)) continue;
    if (/^sha256:[0-9a-f]{64}$/.test(version)) continue;
    unpinned.push(ref);
  }
  return unpinned;
}

const workflowFiles = tracked.filter((file) => /^\.github\/workflows\/.+\.ya?ml$/.test(file));
const unpinnedActionRefs = [];
for (const file of workflowFiles) {
  const absolute = resolve(root, file);
  if (!existsSync(absolute)) continue;
  for (const ref of findUnpinnedActions(readFileSync(absolute, "utf8"))) {
    unpinnedActionRefs.push(`${file}: ${ref}`);
  }
}
if (unpinnedActionRefs.length) {
  fail(`workflow actions are not pinned to commit SHAs: ${unpinnedActionRefs.join("; ")}`);
} else {
  pass(`workflow actions pinned to commit SHAs (${workflowFiles.length} workflow files)`);
}

const gitignore = existsSync(resolve(root, ".gitignore")) ? readFileSync(resolve(root, ".gitignore"), "utf8") : "";
for (const entry of [".env", ".secrets/", "*.private.pem", "*.ofp-license"]) {
  if (!gitignore.split(/\r?\n/).includes(entry)) fail(`.gitignore missing ${entry}`);
}
if (![".env", ".secrets/", "*.private.pem", "*.ofp-license"].some((entry) => !gitignore.includes(entry))) {
  pass("local secret and key outputs are ignored");
}

const envExample = existsSync(resolve(root, ".env.example"))
  ? readFileSync(resolve(root, ".env.example"), "utf8")
  : "";
for (const required of [
  "NODE_ENV=development",
  "JWT_SECRET=change-me-in-production",
  "CORS_ORIGIN=http://localhost:3000",
  "PUBLIC_WEB_URL=http://localhost:3000",
  "JWT_EXPIRES_IN=12h",
  "TRUST_PROXY=false",
]) {
  if (!envExample.includes(required)) fail(`.env.example missing documented setting: ${required}`);
}
if (envExample.includes("STRIPE_SECRET_KEY=sk_live_")) fail(".env.example contains a live Stripe key");
else pass("environment template documents production security settings without live payment secrets");

try {
  const rootPackage = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  for (const script of ["release:safety", "lock:prepare", "install:verified"]) {
    if (!rootPackage.scripts?.[script]) fail(`root package.json is missing ${script}`);
  }
  if (["release:safety", "lock:prepare", "install:verified"].every((script) => rootPackage.scripts?.[script])) {
    pass("release safety and deterministic install commands are configured");
  }

  const apiPackage = JSON.parse(readFileSync(resolve(root, "apps/api/package.json"), "utf8"));
  for (const script of ["license:keypair", "license:generate", "license:verify"]) {
    if (!apiPackage.scripts?.[script]) fail(`API package is missing ${script}`);
  }
  if (["license:keypair", "license:generate", "license:verify"].every((script) => apiPackage.scripts?.[script])) {
    pass("license keypair, generation, and verification commands are configured");
  }
} catch (error) {
  fail(`unable to validate package scripts: ${error instanceof Error ? error.message : String(error)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("OpenFieldPro release safety checks");
  for (const message of passes) console.log(`PASS  ${message}`);
  for (const message of failures) console.error(`FAIL  ${message}`);

  if (failures.length) {
    console.error(`\nRelease safety failed with ${failures.length} finding(s).`);
    process.exit(1);
  }
  console.log(`\nRelease safety passed (${passes.length} checks).`);
}
