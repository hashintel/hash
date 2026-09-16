import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

const observeHook = pathToFileURL(
  join(import.meta.dirname, "../history-retention-runtime-hook.ts"),
).href;

const overflowContinuations = (directory: string) => {
  const trace = readFileSync(
    join(directory, "create-observe-runtime-trace.jsonl"),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        JSON.parse(line) as {
          boundary?: string;
          messages?: { role?: string }[];
        },
    );
  return trace.filter((event) => event.boundary === "continueRebuilt");
};

test.each(["threshold", "silent", "explicit", "cancelled"])(
  "existing-tool history survives folding or active Stop (%s)",
  async (kind) => {
    const directory = await mkdtemp(join(tmpdir(), "brunch-a4-retention-"));
    const observeOverflow = kind === "silent" || kind === "explicit";
    try {
      for (const phase of ["create", "reopen"]) {
        // oxlint-disable-next-line no-await-in-loop -- The previous runtime must stop before the same store is reopened.
        const result = await runNodeScript(
          join(import.meta.dirname, "history-retention.integration.ts"),
          join(import.meta.dirname, "../../../.."),
          {
            A4_OUTPUT_DIRECTORY: directory,
            A4_DIAGNOSTIC_DIRECTORY: directory,
            A4_PHASE: phase,
            A4_OVERFLOW_PROBE: kind === "threshold" ? "0" : "1",
            A4_OVERFLOW_ERROR: kind === "explicit" ? "1" : "0",
            A4_OVERFLOW_CANCEL: kind === "cancelled" ? "1" : "0",
            ...(observeOverflow && phase === "create"
              ? { NODE_OPTIONS: `--import=${observeHook}` }
              : {}),
          },
        );
        expect(result.exitCode, result.stderr + result.stdout).toBe(0);
        expect(result.stdout).toContain(`A4_${phase.toUpperCase()}_PASS`);
        if (observeOverflow && phase === "create") {
          assert.ok(
            !`${result.stdout}${result.stderr}`.includes(
              "Cannot continue from message role: assistant",
            ),
          );
          const continuations = overflowContinuations(directory);
          if (kind === "silent") {
            assert.deepEqual(
              continuations,
              [],
              "Completed successful stop must not be retried from an assistant tail",
            );
          } else {
            assert.equal(continuations.length, 1);
            const tail = continuations[0]?.messages?.at(-1);
            assert.ok(
              tail?.role === "user" || tail?.role === "toolResult",
              "Explicit error must retry from a valid retained canonical tail",
            );
          }
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);

test.each(["missing", "replaced", "changed", "duplicate", "settlement"])(
  "the completion oracle rejects a history-only fault (%s)",
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), "brunch-a4-falsifier-"));
    try {
      const result = await runNodeScript(
        join(import.meta.dirname, "history-retention.integration.ts"),
        join(import.meta.dirname, "../../../.."),
        {
          A4_OUTPUT_DIRECTORY: directory,
          A4_OVERFLOW_PROBE: "1",
          A4_HISTORY_FAULT: mode,
          NODE_OPTIONS: `--import=${pathToFileURL(join(import.meta.dirname, "history-retention-history-fault.ts")).href}`,
        },
      );
      expect(result.exitCode, result.stderr + result.stdout).toBe(1);
      expect(result.stderr).toContain(
        mode === "settlement"
          ? "The response's own completed settlement must remain exact"
          : "The pinned completed response must survive exactly once",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
