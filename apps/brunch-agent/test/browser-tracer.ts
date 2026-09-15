/**
 * Maintained Chrome tracer plus original-store fold/reopen.
 *
 * Purpose: drive the actual local Chrome mutation-record witness, then reopen
 * that same SQLite store in two later Node processes and assert public history,
 * current revision, authorization, and threshold folding. This is the former
 * `history-retention-diagnostics.sh` browser half, without Python or a source
 * hash manifest.
 *
 * Prerequisites: from this package, the website must already be built with
 * `VITE_BRUNCH_CHAT_ENDPOINT=/agents/chat`. The `test:browser-tracer` script
 * builds both artifacts first. Chrome is selected by Playwright /
 * `M7_CHROME_PATH`. No provider key. Loopback only.
 *
 * Invocation:
 *   yarn workspace @apps/brunch-agent test:browser-tracer
 *   M7_BROWSER_OUTPUT=/tmp/fresh-dir yarn workspace @apps/brunch-agent test:browser-tracer
 *   M7_BROWSER_OUTPUT=/tmp/existing-dir yarn workspace @apps/brunch-agent test:history-retention-new-records
 *
 * Outputs: the evidence directory printed by the tracer (`M7_BROWSER_OUTPUT` or
 * a fresh temp dir). Fold/reopen write `retention-*.json` beside the original
 * `conversation.db`. Failures keep that directory.
 *
 * Maintenance: TypeScript, spawned like other package integration scripts.
 * Not a CI `test:integration` case because it needs Chrome and the website dist.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageRoot = join(import.meta.dirname, "..");
const supplied = process.env.M7_BROWSER_OUTPUT;
const newRecordsOnly = process.env.A4_NEW_RECORDS_ONLY === "1";
const directory = newRecordsOnly
  ? supplied
  : (supplied ??
    join(tmpdir(), `m7-browser-${process.pid}-${Date.now().toString(36)}`));
if (directory === undefined) {
  throw new Error(
    "test:history-retention-new-records requires M7_BROWSER_OUTPUT to name an existing tracer directory",
  );
}
if (newRecordsOnly && !existsSync(join(directory, "conversation.db"))) {
  throw new Error(
    "A4_NEW_RECORDS_ONLY requires M7_BROWSER_OUTPUT to name an existing tracer directory",
  );
}
if (!newRecordsOnly && supplied !== undefined && existsSync(directory)) {
  throw new Error(
    "Use a fresh browser evidence directory; retained witnesses must not be overwritten.",
  );
}

const run = (script: string, env: Readonly<Record<string, string>>): void => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", script],
    {
      cwd: packageRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (!newRecordsOnly) {
  run(join(import.meta.dirname, "mutation-records.integration.ts"), {
    M7_BROWSER_OUTPUT: directory,
  });
}

run(join(import.meta.dirname, "history-retention-new-records.integration.ts"), {
  A4_OUTPUT_DIRECTORY: directory,
});
run(join(import.meta.dirname, "history-retention-new-records.integration.ts"), {
  A4_OUTPUT_DIRECTORY: directory,
  A4_PHASE: "reopen",
});
process.stdout.write(`Browser tracer retention passed: ${directory}\n`);
