// New installed-package execution of the unchanged diagnostic assertions, not a historical pin replay.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const output = resolve(process.argv[2]);
assert(!existsSync(output), "Use a fresh evidence directory");
mkdirSync(output, { recursive: true });
const historical = fileURLToPath(
  new URL("../native-schema-20260908T150034Z/", import.meta.url),
);
const scratch = mkdtempSync(join(root, ".native-installed-"));
try {
  // No dependency copies, ad-hoc installed edits, pin regeneration or serializer replacements.
  cpSync(join(historical, "probe.mjs"), join(scratch, "probe.mjs"));
  writeFileSync(
    join(scratch, "context.json"),
    JSON.stringify({
      root,
      evidence: output,
      mode: "candidate",
      applied: "Installed Yarn patches; no scratch package copies",
    }),
  );
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", join(scratch, "probe.mjs")],
    { cwd: root, stdio: "inherit", timeout: 60000 },
  );
  const result = JSON.parse(
    readFileSync(join(output, "candidate.json"), "utf8"),
  );
  assert.equal(result.networkAttempts, 0);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
