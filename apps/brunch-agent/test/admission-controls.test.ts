import { join } from "node:path";

import { isToolUIPart } from "ai";
import { beforeAll, expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

import type { AdmissionControlsResult } from "./admission-controls.integration";

const controls = [
  "baseline",
  "observer-throw",
  "tool-veto",
  "provider-reject",
] as const;
let results: AdmissionControlsResult[];
beforeAll(async () => {
  results = await Promise.all(
    controls.map(async (control) => {
      const { exitCode, stdout, stderr } = await runNodeScript(
        join(import.meta.dirname, "admission-controls.integration.ts"),
        join(import.meta.dirname, "../../.."),
        { A2_ADMISSION_CONTROL: control },
      );
      if (exitCode !== 0) throw new Error(stderr || stdout);
      const line = stdout
        .split("\n")
        .find((entry) => entry.startsWith("ADMISSION_CONTROLS "));
      if (line === undefined) throw new Error(stdout);
      return JSON.parse(
        line.slice("ADMISSION_CONTROLS ".length),
      ) as AdmissionControlsResult;
    }),
  );
});

// These are capability discriminators, not replacements for the unchanged red
// production safety oracle in workpiece-revisions.test.ts. No control is mounted
// by production: only the child process registers these diagnostic candidates.
test("an observer throw cannot veto the mounted mixed proposal", () => {
  for (const result of results.filter(
    ({ control }) => control === "baseline" || control === "observer-throw",
  )) {
    for (const observation of result.observations.filter(
      ({ generated }) =>
        generated.length > 1 &&
        generated.some((call) => call.name === "addType"),
    )) {
      expect(observation.providerCallsBeforeClientResult).toBe(2);
      expect(observation.mutationApplied).toBe(true);
      expect(observation.pendingMutationIds).toHaveLength(1);
    }
  }
});

test("a tool interceptor refuses execution but does not prevent provider continuation", () => {
  const result = results.find(({ control }) => control === "tool-veto")!;
  for (const observation of result.observations.filter(
    ({ generated }) =>
      generated.length > 1 && generated.some((call) => call.name === "addType"),
  )) {
    expect(observation.pendingMutationIds).toEqual([]);
    expect(observation.mutationApplied).toBe(false);
    expect(observation.providerCallsBeforeClientResult).toBe(2);
    expect(observation.attempt.error).toBeNull();
  }
});

test("buffered custom-provider rejection fails closed before publishing a mixed proposal", () => {
  const result = results.find(({ control }) => control === "provider-reject")!;
  for (const observation of result.observations.filter(
    ({ generated }) =>
      generated.length > 1 && generated.some((call) => call.name === "addType"),
  )) {
    expect(observation.pendingMutationIds).toEqual([]);
    expect(observation.after).toEqual(observation.before);
    expect(observation.providerCallsBeforeClientResult).toBe(1);
    expect(observation.attempt.error).toContain("Diagnostic admission refusal");
    const seededIds = new Set(
      observation.seeded.messages.map((message) => message.id),
    );
    const attemptedTools = observation.history.messages
      .filter((message) => !seededIds.has(message.id))
      .flatMap((message) =>
        message.parts.filter((part) => part.type === "dynamic-tool"),
      );
    expect(attemptedTools).toEqual([]);
  }
});

test("each diagnostic control permits settlement, noninteractive markers and independent browser result continuation", () => {
  expect(results).toHaveLength(4);
  for (const result of results) {
    expect(result.observations).toHaveLength(14);
    for (const observation of result.observations) {
      expect(observation.seed.error).toBeNull();
      const revision = observation.seeded.messages
        .flatMap((message) => message.parts)
        .find(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolName === "update_workpiece",
        );
      expect(revision).toMatchObject({
        toolName: "update_workpiece",
        output: {
          revisionId: `${observation.caseId}-old-revision`,
          ordinal: 1,
        },
      });
    }
    const marker = result.observations.find(
      ({ caseId }) => caseId === "brunch_mark_question",
    )!;
    expect(marker.attempt.error).toBeNull();
    expect(marker.providerCallsBeforeClientResult).toBe(2);
    const serverOnly = result.observations.find(
      ({ caseId }) => caseId === "update_workpiece-brunch_mark_question",
    )!;
    expect(serverOnly.attempt.error).toBeNull();
    expect(serverOnly.providerCallsBeforeClientResult).toBe(2);
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
    const projectedTools = browser
      .continuation!.projected.flatMap((message) => message.parts)
      .filter(isToolUIPart);
    expect(projectedTools).toContainEqual(
      expect.objectContaining({
        toolCallId: "addType-addType",
        state: "output-available",
        output: { applied: true },
      }),
    );
    expect(
      projectedTools.filter((part) => part.state === "input-available"),
    ).toEqual([]);
  }
});
