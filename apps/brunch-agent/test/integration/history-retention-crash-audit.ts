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

/** The Ledger commit the create phase interrupts. */
const crashCallId = "a4-crash-revision";

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

const crashOutcomes = (records: readonly JsonObject[]): readonly JsonObject[] =>
  records.filter(
    (record) =>
      record.type === "tool_outcome" && record.toolCallId === crashCallId,
  );

/** Result commitments whose `outcomeIds` name the given outcome record. */
const commitsReferencing = (
  records: readonly JsonObject[],
  outcomeId: unknown,
): readonly JsonObject[] =>
  records.filter(
    (record) =>
      record.type === "tool_results_committed" &&
      Array.isArray(record.outcomeIds) &&
      record.outcomeIds.includes(outcomeId),
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

/** What the store held when the final recovery booted. */
const expectedStateBeforeFinalBoot = (
  kind: CrashRecoveryKind,
): "committed" | "outcome-without-commit" | "no-outcome" => {
  switch (kind) {
    case "plain":
    case "repair-after-repair":
      return "committed";
    case "after-outcome":
    case "repair-after-outcome":
      return "outcome-without-commit";
    case "before-outcome":
      return "no-outcome";
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
 * `history-retention-crash.integration.ts`.
 */
export const assertCrashRecovery = (
  directory: string,
  kind: CrashRecoveryKind,
): void => {
  const faults = collectFaults(directory);
  const observedFaults = faults
    .map((event) => event.boundary)
    .filter((boundary): boundary is string => typeof boundary === "string")
    .sort();
  assert.deepEqual(
    observedFaults,
    [...expectedFaultsFor(kind)].sort(),
    "Exact kill boundaries, not just nonzero exits",
  );
  for (const event of faults.filter(
    ({ boundary }) => boundary === "after-outcome",
  )) {
    const records = asArray(event.records, "fault records").map((record) =>
      asObject(record, "fault record"),
    );
    assert.equal(
      crashOutcomes(records).length,
      1,
      "The killed append carries the crashed call's outcome",
    );
    assert(
      !records.some((record) => record.type === "tool_results_committed"),
      "The killed append carries no result commitment: the inter-append gap",
    );
  }

  const beforeRecovery = loadBatches(
    join(directory, "recover-plain-store-before-boot.json"),
  ).flatMap((batch) => batch.data);
  const beforeOutcomes = crashOutcomes(beforeRecovery);
  const expectedState = expectedStateBeforeFinalBoot(kind);
  if (expectedState === "no-outcome") {
    assert.equal(
      beforeOutcomes.length,
      0,
      "No outcome was recorded before boot",
    );
  } else {
    assert.equal(
      beforeOutcomes.length,
      1,
      "One outcome was recorded before boot",
    );
    assert.equal(
      commitsReferencing(beforeRecovery, beforeOutcomes[0]?.id).length,
      expectedState === "committed" ? 1 : 0,
      expectedState === "committed"
        ? "The outcome was already committed before boot"
        : "The outcome was durable without a result commitment before boot",
    );
  }

  const receipt = asObject(
    readJson(join(directory, "receipt.json")),
    "receipt",
  );
  const entries = asArray(receipt.entries, "receipt entries");
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
  assert(recovered, "Recovery must expose the crashed commit");
  assert.deepEqual(
    recovered.input,
    { entries },
    "Recovered tool input must match the crashed entries",
  );
  assert.partialDeepStrictEqual(
    recovered.output,
    {
      status: "recorded",
      commitId: crashCallId,
      revision: 1,
      ids: ["e1", "c1"],
    },
    "Recovered tool output must carry the same host-assigned record IDs",
  );

  const nextRevision = nextTools.at(-1);
  assert(nextRevision, "Recovery must expose the next commit");
  assert.equal(
    nextRevision.toolCallId,
    "a4-next-revision",
    "Distinct next commit must keep its call identity",
  );
  assert.partialDeepStrictEqual(
    nextRevision.output,
    {
      status: "recorded",
      commitId: "a4-next-revision",
      revision: 2,
      ids: ["c2"],
    },
    "The next commit must see the recovered records",
  );
  assert.deepEqual(
    nextTools.map((tool) => tool.toolCallId),
    [crashCallId, "a4-next-revision"],
    "Recovery must not reissue the completed call or reuse a commit ID",
  );

  const afterRecovery = loadBatches(
    join(directory, "recover-plain-store-after-recovery.json"),
  ).flatMap((batch) => batch.data);
  const outcomes = crashOutcomes(afterRecovery);
  assert.equal(
    outcomes.length,
    1,
    "Exactly one durable outcome record, no completed-call replay",
  );
  assert.equal(
    commitsReferencing(afterRecovery, outcomes[0]?.id).length,
    1,
    "Exactly one result commitment references that outcome",
  );
  assert(
    !afterRecovery.some((record) => record.type === "state_write"),
    "The Ledger's only authority is tool history; no state is written",
  );
};
