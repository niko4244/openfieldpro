import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("./backup.sh", import.meta.url), "utf8");
const powershell = readFileSync(new URL("./backup.ps1", import.meta.url), "utf8");

test("backup wrappers expose only the fixed authenticated controller operation", () => {
  for (const source of [shell, powershell]) {
    assert.match(source, /http:\/\/127\.0\.0\.1:3010\/v1\/backups/);
    assert.match(source, /\.secrets[\\/]openfieldpro_operations_controller/);
    assert.doesNotMatch(
      source,
      /\b(?:pg_dump|age|tar|podman|docker|Invoke-Expression|Start-Process)\b|source\s+\.env|\.\s+\.env/,
    );
  }
  assert.match(shell, /\[ "\$#" -ne 0 \]/);
  assert.doesNotMatch(shell, /\$@|\beval\b/);
  assert.match(powershell, /\[CmdletBinding\(\)\]\s*param\(\)/);
  assert.doesNotMatch(powershell, /\bparam\s*\([^)]*\w+[^)]*\)/);
});

test("controller secrets are read from files and not accepted as arguments or environment values", () => {
  assert.match(shell, /< "\$SECRET_FILE"/);
  assert.match(shell, /--header @-/);
  assert.doesNotMatch(shell, /OPERATIONS_CONTROLLER_(?:SECRET|TOKEN)=/);
  assert.match(powershell, /Get-Content -Raw -LiteralPath \$secretFile/);
  assert.doesNotMatch(powershell, /\$env:.*(?:SECRET|TOKEN)/i);
});
