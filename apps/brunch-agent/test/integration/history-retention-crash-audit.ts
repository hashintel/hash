import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { CONSTRUCTION_CONTEXT_SIGNAL_TYPE } from "@hashintel/brunch-agent-plugin-sdcpn/flue";

export type CrashRecoveryKind =
  | "plain"
  | "observe"
  | "after-outcome"
  | "before-outcome"
  | "direct-after-outcome"
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

const lastRevision = (snapshot: JsonObject): unknown => {
  const messages = asArray(snapshot.messages, "history messages").filter(
    (message): message is JsonObject => {
      if (!isJsonObject(message) || !isJsonObject(message.signal)) {
        return false;
      }
      return message.signal.tagName === CONSTRUCTION_CONTEXT_SIGNAL_TYPE;
    },
  );
  const lastMessage = messages.at(-1);
  if (lastMessage === undefined) {
    throw new Error("Successful recovered result without exact current state");
  }
  const text = asArray(lastMessage.parts, "construction-context parts")
    .filter(
      (part): part is JsonObject =>
        isJsonObject(part) &&
        part.type === "text" &&
        typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
  return asObject(JSON.parse(text), "construction context").currentWorkpiece;
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
    case "observe":
      return [];
    case "after-outcome":
      return ["after-outcome"];
    case "before-outcome":
      return ["before-outcome"];
    case "direct-after-outcome":
      return ["direct-after-outcome"];
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
  if (typeof receipt.markdown !== "string") {
    throw new Error("receipt markdown must be a string");
  }
  const expected = {
    revisionId: "a4-crash-revision",
    sha256: createHash("sha256").update(receipt.markdown).digest("hex"),
    ordinal: 1,
    markdown: receipt.markdown,
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
    throw new Error(
      "Recovery must expose the crashed revision and the next one",
    );
  }
  assert.deepEqual(
    recovered.input,
    { markdown: receipt.markdown },
    "Recovered tool input must match the crashed markdown",
  );
  assert.deepEqual(
    recovered.output,
    expected,
    "Recovered tool output must match the crashed pointer and markdown",
  );
  assert.deepEqual(
    lastRevision(
      asObject(
        readJson(join(directory, "recover-plain-history.json")),
        "recovered history",
      ),
    ),
    expected,
    "Successful recovered result without exact current state",
  );
  assert.equal(
    nextRevision.toolCallId,
    "a4-next-revision",
    "Distinct next revision must keep its call identity",
  );
  assert.ok(
    isJsonObject(nextRevision.output) && nextRevision.output.ordinal === 2,
    "Distinct next revision must advance to ordinal 2",
  );
  assert.deepEqual(
    nextTools.map((tool) => tool.toolCallId),
    ["a4-crash-revision", "a4-next-revision"],
    "Recovery must not reissue the completed call or reuse a revision ID",
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
  const stateWrites = afterRecovery.flatMap((batch) =>
    batch.data.filter(
      (record) =>
        record.type === "state_write" &&
        isJsonObject(record.value) &&
        record.value.revisionId === "a4-crash-revision",
    ),
  );
  const stateWrite = stateWrites[0];
  if (stateWrites.length !== 1 || stateWrite === undefined) {
    throw new Error("Recovered state write must be the exact current revision");
  }
  assert.deepEqual(
    stateWrite.value,
    expected,
    "Recovered state write must be the exact current revision",
  );
  if (!outcome.data.includes(stateWrite)) {
    throw new Error("State must be atomic with the outcome, not a later flush");
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
  for (const batch of loadBatches(
    join(directory, "recover-plain-store-before-boot.json"),
  )) {
    if (
      batch.data.some(
        (record) =>
          record.type === "tool_outcome" &&
          record.toolCallId === "a4-crash-revision",
      ) &&
      !batch.data.some(
        (record) =>
          record.type === "state_write" &&
          isJsonObject(record.value) &&
          record.value.revisionId === expected.revisionId &&
          record.value.sha256 === expected.sha256 &&
          record.value.ordinal === expected.ordinal &&
          record.value.markdown === expected.markdown,
      )
    ) {
      throw new Error(
        "Atomic invariant must hold before replacement application boot too",
      );
    }
  }
};
