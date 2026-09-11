import { join } from "node:path";

import { isToolUIPart, type UIMessageChunk } from "ai";
import { beforeAll, expect, test } from "vitest";

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

test("production rejects every mixed proposal before publishing or partially executing it", () => {
  expect(result.observations).toHaveLength(14);
  const mixed = result.observations.filter(
    ({ generated }) =>
      generated.length > 1 && generated.some((call) => call.name === "addType"),
  );
  expect(mixed).toHaveLength(11);
  for (const observation of mixed) {
    expect(observation.pendingMutationIds).toEqual([]);
    expect(observation.after).toEqual(observation.before);
    expect(observation.providerCallsBeforeClientResult).toBe(1);
    expect(observation.attempt.error).toContain(
      "Mixed browser/server proposal refused",
    );
    const uiChunks: UIMessageChunk[] = [];
    const ui = createFlueUiStream({
      submissionId: observation.attempt.receipt.submissionId,
      clientToolNames: new Set(["addType"]),
      write: (chunk) => {
        uiChunks.push(chunk);
      },
    });
    for (const { chunk } of result.wire) ui.accept(chunk);
    expect(uiChunks).toContainEqual(expect.objectContaining({ type: "error" }));
    expect(
      uiChunks.some((chunk) => chunk.type === "tool-input-available"),
    ).toBe(false);
    const ids = new Set(observation.generated.map((call) => call.id));
    expect(
      result.wire.filter(
        ({ chunk }) => "toolCallId" in chunk && ids.has(chunk.toolCallId),
      ),
    ).toEqual([]);
    expect(
      observation.history.messages
        .filter(
          (message) =>
            message.submissionId === observation.attempt.receipt.submissionId,
        )
        .flatMap((message) =>
          message.parts.filter((part) => part.type === "dynamic-tool"),
        ),
    ).toEqual([]);
    expect(observation.history.settlements).toContainEqual(
      expect.objectContaining({
        submissionId: observation.attempt.receipt.submissionId,
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
  const failed = result.observations.filter(
    ({ attempt }) => attempt.error !== null,
  );
  expect(failed.length).toBeGreaterThan(0);
  for (const observation of failed) {
    const { submissionId } = observation.attempt.receipt;
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

test("production still settles revisions and noninteractive markers without browser results", () => {
  for (const observation of result.observations) {
    expect(observation.seed.error).toBeNull();
    const revision = observation.seeded.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" && part.toolName === "update_workpiece",
      );
    expect(revision).toMatchObject({
      output: { revisionId: `${observation.caseId}-old-revision`, ordinal: 1 },
    });
  }
  for (const caseId of [
    "brunch_mark_question",
    "update_workpiece-brunch_mark_question",
  ]) {
    const observation = result.observations.find(
      (entry) => entry.caseId === caseId,
    )!;
    expect(observation.attempt.error).toBeNull();
    expect(observation.providerCallsBeforeClientResult).toBe(2);
  }
});

test("an independently admitted browser mutation waits for its correlated result and does not reapply", () => {
  const browser = result.observations.find(
    ({ caseId }) => caseId === "addType",
  )!;
  expect(browser.providerCallsBeforeClientResult).toBe(1);
  expect(browser.pendingMutationIds).toEqual(["addType-addType"]);
  expect(browser.after.types).toHaveLength(1);
  expect(browser.continuation?.outcome.error).toBeNull();
  expect(browser.continuation?.totalProviderCalls).toBe(2);
  expect(browser.continuation?.history.conversationId).toBe(
    browser.history.conversationId,
  );
  expect(browser.continuation?.definitionAfterResume).toEqual(browser.after);
  const projected = browser.continuation!.projected;
  const tools = projected
    .flatMap((message) => message.parts)
    .filter(isToolUIPart);
  expect(tools).toContainEqual(
    expect.objectContaining({
      toolCallId: "addType-addType",
      state: "output-available",
      output: { applied: true },
    }),
  );
  expect(tools.filter((part) => part.state === "input-available")).toEqual([]);
  expect(
    projected.some((message) =>
      message.metadata?.voiceToolCallIds?.includes("addType-addType"),
    ),
  ).toBe(true);
});

test("active Stop cancels buffered output and late completion cannot leak prose or tools", () => {
  for (const sample of result.buffering) {
    expect(
      sample.projectedDuring.filter((message) => message.role === "assistant"),
    ).toEqual([]);
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
    stopped.projectedAfter.filter((message) => message.role === "assistant"),
  ).toEqual([]);
  expect(
    result.wire.filter(
      ({ caseId, chunk }) =>
        caseId === stopped.caseId &&
        (chunk.type === "tool-input" || chunk.type === "message-delta"),
    ),
  ).toEqual([]);
  const valid = result.buffering.find(
    ({ caseId }) => caseId === "buffered-valid",
  )!;
  expect(valid.error).toBeNull();
  expect(
    valid.projectedAfter.flatMap((message) => message.parts),
  ).toContainEqual(expect.objectContaining({ type: "text", text: valid.text }));
});
