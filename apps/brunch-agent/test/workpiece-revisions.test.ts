import { createHash } from "node:crypto";
import { join } from "node:path";

import { beforeAll, expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

import type { WorkpieceRevisionProbeResult } from "./workpiece-revisions.integration";

let result: WorkpieceRevisionProbeResult;
beforeAll(async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(import.meta.dirname, "workpiece-revisions.integration.ts"),
    join(import.meta.dirname, "../../.."),
    {},
  );
  if (exitCode !== 0) throw new Error(stderr || stdout);
  const line = stdout
    .split("\n")
    .find((entry) => entry.startsWith("WORKPIECE_REVISIONS "));
  if (line === undefined) throw new Error(stdout);
  result = JSON.parse(
    line.slice("WORKPIECE_REVISIONS ".length),
  ) as WorkpieceRevisionProbeResult;
});

test("the built agent settles a revision over the mounted route", () => {
  expect(result.settled).toContainEqual(
    expect.objectContaining({
      toolName: "update_workpiece",
      state: "output-available",
      output: {
        revisionId: "settled-revision",
        sha256: createHash("sha256")
          .update(result.markdown, "utf8")
          .digest("hex"),
        ordinal: 1,
      },
    }),
  );
  expect(
    result.second.find((part) => part.toolCallId === "second-revision")?.output,
  ).toMatchObject({ revisionId: "second-revision", ordinal: 2 });
});

test("public history preserves the tool call identity", () => {
  const call = result.settled.find(
    (part) => part.toolName === "update_workpiece",
  );
  expect(call?.toolCallId).toBe("settled-revision");
  expect(call?.output).toMatchObject({ revisionId: call?.toolCallId });
  expect(result.reopened).toEqual(result.settled);
});

test("mixed workpiece and browser tool batch does not apply a mutation", () => {
  // Keep this safety oracle red until production admission is enforced. A prompt
  // or a passing characterization of the unsafe behavior cannot discharge it.
  const workpieceBatches = result.mixed.filter(({ caseId }) =>
    caseId.includes("update_workpiece"),
  );
  expect(
    workpieceBatches.map(({ caseId, mutationApplied, pendingMutationIds }) => ({
      caseId,
      mutationApplied,
      pendingMutationIds,
    })),
  ).toEqual(
    workpieceBatches.map(({ caseId }) => ({
      caseId,
      mutationApplied: false,
      pendingMutationIds: [],
    })),
  );
});
