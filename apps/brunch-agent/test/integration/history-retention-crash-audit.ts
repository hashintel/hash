import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type CrashRecoveryKind =
  | "plain"
  | "after-outcome"
  | "before-outcome"
  | "repair-after-repair"
  | "repair-after-outcome";

interface JsonObject {
  readonly [key: string]: unknown;
}

interface StoreBatch {
  readonly data: readonly JsonObject[];
}

interface RecoveredTool {
  readonly input: unknown;
  readonly output: unknown;
  readonly toolCallId?: unknown;
}

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8")) as unknown;

const asObject = (value: unknown, label: string): JsonObject => {
  if (!isJsonObject(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
};

const asArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
};

const loadBatches = (path: string): readonly StoreBatch[] =>
  asArray(asObject(readJson(path), path).batches, `${path} batches`).map(
    (batch) => {
      const record = asObject(batch, "store batch");
      return {
        data: asArray(record.data, "store batch data").map((entry) =>
          asObject(entry, "store record"),
        ),
      };
    },
  );

const outcomeBatches = (
  batches: readonly StoreBatch[],
): readonly StoreBatch[] =>
  batches.filter((batch) =>
    batch.data.some(
      (record) =>
        record.type === "tool_outcome" &&
        record.toolCallId === "a4-crash-revision",
    ),
  );

const expectedFaultsFor = (kind: CrashRecoveryKind): readonly string[] => {
  switch (kind) {
    case "plain":
      return [];
    case "after-outcome":
      return ["after-outcome"];
    case "before-outcome":
      return ["before-outcome"];
    case "repair-after-repair":
      return ["before-outcome", "after-repair"];
    case "repair-after-outcome":
      return ["before-outcome", "after-outcome"];
  }
};

const collectFaults = (directory: string): readonly JsonObject[] =>
  readdirSync(directory)
    .filter((name) => name.endsWith("-runtime-trace.jsonl"))
    .flatMap((name) =>
      readFileSync(join(directory, name), "utf8")
        .split("\n")
        .filter((line) => line.includes('"fault"'))
        .map((line) => asObject(JSON.parse(line), name)),
    );

/**
 * Read-only adjudication of a crash-recovery directory produced by
 * `history-retention-crash.integration.ts`. Replaces the former Python audit.
 */
export const assertCrashRecovery = (
  directory: string,
  kind: CrashRecoveryKind,
): void => {
  const receipt = asObject(
    readJson(join(directory, "receipt.json")),
    "receipt",
  );
  const changes = asArray(receipt.changes, "receipt changes");
  const expectedOutput = {
    status: "recorded",
    commitId: "a4-crash-revision",
    revision: 1,
    notes: [{ address: "purpose/n1" }],
  };
  const result = asObject(
    readJson(join(directory, "recover-plain-result.json")),
    "recover result",
  );
  const recoveredTools = asArray(
    result.recoveredTools,
    "recoveredTools",
  ) as RecoveredTool[];
  const nextTools = asArray(result.nextTools, "nextTools") as RecoveredTool[];
  const recovered = recoveredTools[0];
  const nextRevision = nextTools.at(-1);
  if (recovered === undefined || nextRevision === undefined) {
    throw new Error("Recovery must expose the crashed commit and the next one");
  }
  assert.deepEqual(
    recovered.input,
    { changes },
    "Recovered tool input must match the crashed changes",
  );
  assert.deepEqual(
    recovered.output,
    expectedOutput,
    "Recovered tool output must carry the same host-assigned addresses",
  );
  assert.equal(
    nextRevision.toolCallId,
    "a4-next-revision",
    "Distinct next commit must keep its call identity",
  );
  assert.deepEqual(
    nextRevision.output,
    {
      status: "recorded",
      commitId: "a4-next-revision",
      revision: 2,
      notes: [{ address: "purpose/n2", supersedes: "purpose/n1" }],
    },
    "The next commit must see the recovered Note",
  );
  assert.deepEqual(
    nextTools.map((tool) => tool.toolCallId),
    ["a4-crash-revision", "a4-next-revision"],
    "Recovery must not reissue the completed call or reuse a commit ID",
  );
  const afterRecovery = loadBatches(
    join(directory, "recover-plain-store-after-recovery.json"),
  );
  const outcomes = outcomeBatches(afterRecovery);
  if (outcomes.length !== 1) {
    throw new Error("Exactly one durable outcome, no completed call replay");
  }
  const outcome = outcomes[0];
  if (outcome === undefined) {
    throw new Error("Exactly one durable outcome, no completed call replay");
  }
  if (
    afterRecovery.some((batch) =>
      batch.data.some((record) => record.type === "state_write"),
    )
  ) {
    throw new Error(
      "The Ledger's only authority is tool history; no state is written",
    );
  }
  if (kind.startsWith("repair-") || kind === "before-outcome") {
    if (
      !outcome.data.some((record) => record.type === "tool_results_committed")
    ) {
      throw new Error(
        "Reexecuted state/outcome/result must share the repaired canonical batch",
      );
    }
  }
  const faults = collectFaults(directory);
  const observed = faults
    .map((event) => event.boundary)
    .filter((boundary): boundary is string => typeof boundary === "string")
    .slice()
    .sort();
  const expectedFaults = [...expectedFaultsFor(kind)].sort();
  assert.deepEqual(
    observed,
    expectedFaults,
    "Exact kill boundaries, not just nonzero exits",
  );
};
