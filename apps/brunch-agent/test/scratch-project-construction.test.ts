import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

interface ScratchProjectConstructionResult {
  readonly completedCallIds: readonly string[];
  readonly failedCalls: readonly string[];
  readonly inputArcCount: number;
  readonly outputArcCount: number;
  readonly parseOk: boolean;
  readonly placeIds: readonly string[];
  readonly toolNames: readonly string[];
  readonly transitionIds: readonly string[];
}

test("one concrete request automatically constructs a complete scratch net", async () => {
  const dbDirectory = await mkdtemp(join(tmpdir(), "brunch-scratch-"));
  const dbPath = join(dbDirectory, "conversations.db");

  try {
    const { exitCode, stdout, stderr } = await runNodeScript(
      join(import.meta.dirname, "scratch-project-construction.integration.ts"),
      join(import.meta.dirname, "../../.."),
      { BRUNCH_CHAT_DB_PATH: dbPath },
    );

    expect(exitCode, stderr || stdout).toBe(0);
    const resultLine = stdout
      .split("\n")
      .find((line) => line.startsWith("SCRATCH_PROJECT_CONSTRUCTION_RESULT "));
    expect(resultLine, stdout).toBeDefined();
    const result = JSON.parse(
      resultLine!.slice("SCRATCH_PROJECT_CONSTRUCTION_RESULT ".length),
    ) as ScratchProjectConstructionResult;

    expect(result.parseOk).toBe(true);
    expect(result.failedCalls).toEqual([]);
    expect(result.placeIds).toEqual(["orders_waiting", "orders_fulfilled"]);
    expect(result.transitionIds).toEqual(["fulfill_order"]);
    expect(result.inputArcCount).toBe(1);
    expect(result.outputArcCount).toBe(1);
    expect(result.completedCallIds).toEqual([
      "read-empty-scratch",
      "add-orders-waiting",
      "add-orders-fulfilled",
      "add-fulfill-order",
      "connect-orders-waiting",
      "connect-orders-fulfilled",
    ]);
    expect(result.toolNames).toEqual(
      expect.arrayContaining([
        "getLatestNetDefinition",
        "addPlace",
        "addTransition",
        "addArc",
      ]),
    );
  } finally {
    await rm(dbDirectory, { recursive: true, force: true });
  }
});
