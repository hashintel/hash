/** Isolated process-local fault/observe hook for history-retention Vitest suites.
 * Spawned through `--import`; never writes installed runtime or canonical records.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";

const directory = process.env.A4_DIAGNOSTIC_DIRECTORY;
assert(directory);
const mode = process.env.A4_FAULT;
assert(mode);
const label = `${process.env.A4_PHASE ?? "create"}-${mode}`;
const trace = join(directory, `${label}-runtime-trace.jsonl`);
assert(!existsSync(trace), "Fresh trace required");
type DiagnosticRecord = { type: string; id: string; toolCallId?: string };
const report = (event: Record<string, unknown>) =>
  appendFileSync(trace, `${JSON.stringify({ pid: process.pid, ...event })}\n`);
const kill = (boundary: string, records: DiagnosticRecord[]) => {
  report({ boundary, fault: mode, records });
  process.kill(process.pid, "SIGKILL");
};
Reflect.set(globalThis, Symbol.for("a4.runtime.diagnostic"), {
  async append(
    _session: unknown,
    records: DiagnosticRecord[],
    proceed: () => Promise<unknown>,
  ) {
    report({ boundary: "before-append", records });
    const target = records.some(
      (record) =>
        record.type === "tool_outcome" &&
        record.toolCallId === "a4-crash-revision",
    );
    if (mode === "before-outcome" && target) kill("before-outcome", records);
    const result = await proceed();
    report({ boundary: "after-append", records });
    if (mode === "after-outcome" && target) kill("after-outcome", records);
    if (
      mode === "after-repair" &&
      records.some(
        (record) =>
          record.type === "tool_results_committed" &&
          record.id.startsWith("record_tool_repair_commit_"),
      )
    )
      kill("after-repair", records);
    return result;
  },
});
registerHooks({
  load(url, context, nextLoad) {
    if (
      !url.endsWith(
        "/@flue/runtime/dist/conversation-stream-store-CXwRWonS.mjs",
      )
    )
      return nextLoad(url, context);
    const original = readFileSync(new URL(url), "utf8");
    const append =
      "\tappendCanonical(records) {\n\t\treturn this.conversationWriter.append(records, this.canonicalAppendOptions());\n\t}";
    assert.equal(original.split(append).length, 2);
    const source = original.replace(
      append,
      '\tappendCanonical(records) {\n\t\treturn globalThis[Symbol.for("a4.runtime.diagnostic")].append(this, records, () => this.conversationWriter.append(records, this.canonicalAppendOptions()));\n\t}',
    );
    const hash = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    writeFileSync(
      join(directory, `${label}-instrumentation.json`),
      `${JSON.stringify(
        {
          url,
          mode,
          originalSha256: hash(original),
          instrumentedSha256: hash(source),
          policy:
            "One load-time substitution only: observe/interrupt canonical append promises. No repair or stored-record insertion.",
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(join(directory, `${label}-instrumented-runtime.mjs`), source);
    return { format: "module", source, shortCircuit: true };
  },
});
