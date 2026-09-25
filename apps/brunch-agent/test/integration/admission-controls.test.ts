import { join } from "node:path";

import { isToolUIPart, type UIMessageChunk } from "ai";
import { beforeAll, expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";
import { createFlueUiStream } from "@hashintel/brunch-agent-transport-aisdk";

import { runNodeScript } from "./run-node-script";

import type { AdmissionControlsResult } from "./admission-controls.integration";

let result: AdmissionControlsResult;
let serverOutput: string;
let localDiagnosticOutput: string;
beforeAll(async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "admission-controls.integration.ts"),
    join(import.meta.dirname, "../../../.."),
    { NODE_ENV: "development" },
  );
  if (exitCode !== 0) throw new Error(stderr || stdout);
  serverOutput = stdout;
  localDiagnosticOutput = stderr;
  const line = stdout
    .split("\n")
    .find((entry) => entry.startsWith("ADMISSION_CONTROLS "));
  if (line === undefined) throw new Error(stdout);
  result = JSON.parse(
    line.slice("ADMISSION_CONTROLS ".length),
  ) as AdmissionControlsResult;
});

test("production rejects every mixed proposal outside the allowlist before publishing or partially executing it", () => {
  expect(result.refusals).toHaveLength(3);
  for (const refusal of result.refusals) {
    expect(refusal.providerCalls).toBe(1);
    expect(refusal.attempt.error).toContain(
      "Mixed browser/server proposal refused",
    );
    const uiChunks: UIMessageChunk[] = [];
    const ui = createFlueUiStream({
      submissionId: refusal.attempt.receipt.submissionId,
      clientToolNames: new Set(["addType"]),
      asyncClientToolNames: new Set(["addType"]),
      write: (chunk) => {
        uiChunks.push(chunk);
      },
    });
    for (const { chunk } of result.wire) ui.accept(chunk);
    expect(uiChunks).toContainEqual(expect.objectContaining({ type: "error" }));
    expect(
      uiChunks.some((chunk) => chunk.type === "tool-input-available"),
    ).toBe(false);
    const ids = new Set(refusal.generated.map((call) => call.id));
    expect(
      result.wire.filter(
        ({ chunk }) => "toolCallId" in chunk && ids.has(chunk.toolCallId),
      ),
    ).toEqual([]);
    expect(
      refusal.history.messages
        .filter(
          (message) =>
            message.submissionId === refusal.attempt.receipt.submissionId,
        )
        .flatMap((message) =>
          message.parts.filter((part) => part.type === "dynamic-tool"),
        ),
    ).toEqual([]);
    expect(refusal.history.settlements).toContainEqual(
      expect.objectContaining({
        submissionId: refusal.attempt.receipt.submissionId,
        outcome: "failed",
      }),
    );
  }
});

test("every failed submission is attributable from the server output by stage, submission ID and original error", () => {
  const diagnosticLines = serverOutput
    .split("\n")
    .filter((line) => line.includes("[brunch] flue."));
  const localLines = localDiagnosticOutput
    .split("\n")
    .filter((line) => line.includes("[brunch] flue."));
  expect(result.refusals.length).toBeGreaterThan(0);
  for (const refusal of result.refusals) {
    const { submissionId } = refusal.attempt.receipt;
    const settlementLine = diagnosticLines.find(
      (line) =>
        line.includes("[brunch] flue.submission failed") &&
        line.includes(`"submissionId":"${submissionId}"`),
    );
    expect(
      settlementLine,
      `settlement diagnostic for ${submissionId}`,
    ).toBeDefined();
    expect(settlementLine).toContain('"stage":"flue.submission"');
    expect(settlementLine).toContain('"outcome":"failed"');
    // Shared logger stays export-safe; development keeps the original
    // failure on the process-local sink so it can be read without a collector.
    expect(settlementLine).not.toContain(
      "Mixed browser/server proposal refused",
    );
    const localSettlement = localLines.find(
      (line) =>
        line.includes("[brunch] flue.submission failed") &&
        line.includes(`"submissionId":"${submissionId}"`),
    );
    expect(
      localSettlement,
      `local settlement diagnostic for ${submissionId}`,
    ).toContain("Mixed browser/server proposal refused");
    // The submission's own prompt operation is not reported a second time.
    expect(
      diagnosticLines.filter(
        (line) =>
          line.includes("[brunch] flue.operation failed") &&
          line.includes(`"submissionId":"${submissionId}"`),
      ),
    ).toEqual([]);
  }
  // Prompt, tool arguments and results never appear in the diagnostic output.
  const diagnosticOutput = [...diagnosticLines, ...localLines].join("\n");
  expect(diagnosticOutput).not.toContain(result.question);
  expect(diagnosticOutput).not.toContain('"args"');
  for (const { privateMarkdown } of result.buffering) {
    expect(diagnosticOutput).not.toContain(privateMarkdown);
  }
});

test("production still settles server-side revisions without browser results", () => {
  const observation = result.observations.find(
    (entry) => entry.caseId === brunchTools.mutateWorkpiece,
  )!;
  expect(observation.seed.error).toBeNull();
  const revision = observation.seeded.messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" &&
        part.toolName === brunchTools.mutateWorkpiece,
    );
  expect(revision).toMatchObject({
    output: { revisionId: `${observation.caseId}-old-revision`, ordinal: 1 },
  });
  expect(observation.attempt.error).toBeNull();
  expect(observation.providerCallsBeforeClientResult).toBe(2);
});

test("progress streams before admission; Stop prevents tools and late completion without erasing partial prose", () => {
  for (const sample of result.buffering) {
    const parts = sample.projectedDuring.flatMap((message) => message.parts);
    expect(parts).toContainEqual(
      expect.objectContaining({ type: "text", text: sample.text }),
    );
    expect(parts.filter(isToolUIPart)).toEqual([]);
    expect(
      sample.during.settlements.some(
        (settlement) => settlement.submissionId === sample.receipt.submissionId,
      ),
    ).toBe(false);
  }
  const stopped = result.buffering.find(
    ({ caseId }) => caseId === "buffered-cancelled",
  )!;
  expect(stopped.upstreamAborted).toBe(true);
  expect(stopped.error).not.toBeNull();
  expect(stopped.after.settlements).toContainEqual(
    expect.objectContaining({
      submissionId: stopped.receipt.submissionId,
      outcome: "aborted",
    }),
  );
  expect(
    stopped.projectedAfter.flatMap((message) => message.parts),
  ).toContainEqual(
    expect.objectContaining({ type: "text", text: stopped.text }),
  );
  expect(
    result.wire.filter(
      ({ caseId, chunk }) =>
        caseId === stopped.caseId && chunk.type === "tool-input",
    ),
  ).toEqual([]);
  expect(
    result.wire.filter(
      ({ caseId, chunk }) =>
        caseId === stopped.caseId && chunk.type === "message-delta",
    ),
  ).toHaveLength(1);
  const valid = result.buffering.find(
    ({ caseId }) => caseId === "buffered-valid",
  )!;
  expect(valid.error).toBeNull();
  expect(
    valid.projectedAfter.flatMap((message) => message.parts),
  ).toContainEqual(expect.objectContaining({ type: "text", text: valid.text }));
});
