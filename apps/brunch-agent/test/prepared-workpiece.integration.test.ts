import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

test("the built ChatAgent preserves prepared and model workpiece provenance", async () => {
  const databaseDirectory = await mkdtemp(
    join(tmpdir(), "brunch-prepared-workpiece-"),
  );
  try {
    const { exitCode, stdout, stderr } = await runNodeScript(
      join(import.meta.dirname, "prepared-workpiece.integration.ts"),
      join(import.meta.dirname, "../../.."),
      {
        BRUNCH_CHAT_DB_PATH: join(databaseDirectory, "conversations.db"),
      },
    );
    expect(exitCode, stderr || stdout).toBe(0);
    const resultLine = stdout
      .split("\n")
      .find((line) => line.startsWith("PREPARED_WORKPIECE_HERMETIC "));
    expect(resultLine, stdout).toBeDefined();
    const result = JSON.parse(
      resultLine!.slice("PREPARED_WORKPIECE_HERMETIC ".length),
    ) as {
      readonly clientToolCallIds: string[];
      readonly messageCountStableAcrossRetry: boolean;
      readonly prepared: {
        readonly authorship: string;
        readonly content: string;
        readonly sourceKind: string;
      };
      readonly preparedDispatchCount: number;
      readonly preparationSubmissionId: string;
      readonly retryDeduplicated: boolean;
      readonly retrySubmissionId: string;
      readonly targetArcAdded: boolean;
      readonly revision: {
        readonly authorship: string;
        readonly content: string;
        readonly sourceKind: string;
      };
    };

    expect(result.retryDeduplicated).toBe(true);
    expect(result.retrySubmissionId).toBe(result.preparationSubmissionId);
    expect(result.messageCountStableAcrossRetry).toBe(true);
    expect(result.preparedDispatchCount).toBe(1);
    expect(result.clientToolCallIds).toEqual([
      "fixture-read-before-mutation",
      "fixture-add-reservation-arc",
    ]);
    expect(result.targetArcAdded).toBe(true);
    expect(result.prepared).toMatchObject({
      authorship: "test-authored",
      content: "# Prepared revision\n\nTiming and recovery remain unresolved.",
      sourceKind: "prepared-signal",
    });
    expect(result.revision).toMatchObject({
      authorship: "model-produced",
      sourceKind: "assistant",
    });
    expect(result.revision.content).toContain("# Model revision one");
  } finally {
    await rm(databaseDirectory, { recursive: true, force: true });
  }
});
