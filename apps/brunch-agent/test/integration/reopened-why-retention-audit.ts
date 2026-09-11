import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const snapshotNames = [
  "create-history",
  "fold-before",
  "fold-immediate-history",
  "fold-history",
  "reopen-before",
  "reopen-history",
] as const;
const queryNames = [
  "process-restarted-before-fold",
  "fold-after-compaction",
  "reopen-after-compaction",
] as const;
const extraNames = [
  "seed",
  "fold-completion-pins",
  "fold-canonical-settlements",
  "reopen-canonical-settlements",
  "fold-contexts",
  "reopen-contexts",
  "fold-events",
  "create-process",
  "fold-process",
  "reopen-process",
  "create-result",
  "fold-result",
  "reopen-result",
] as const;

const sourceText =
  "TEST synthetic original testimony control: When final inspection starts, reserve one available crew until sign-off.";

interface JsonObject {
  [key: string]: unknown;
}

type RetentionBundle = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asObject = (value: unknown, label: string): JsonObject => {
  assert.ok(isJsonObject(value), `${label} must be an object`);
  return value;
};

const asArray = (value: unknown, label: string): unknown[] => {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  return value;
};

const loadNamed = (directory: string, name: string): unknown => {
  const jsonPath = join(directory, `${name}.json`);
  if (existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, "utf8")) as unknown;
  }
  return JSON.parse(
    gunzipSync(readFileSync(join(directory, `${name}.json.gz`))).toString(
      "utf8",
    ),
  ) as unknown;
};

const textOf = (message: JsonObject): string =>
  asArray(message.parts, "message parts")
    .filter(
      (part): part is JsonObject =>
        isJsonObject(part) &&
        part.type === "text" &&
        typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");

const toolsOf = (snapshot: JsonObject): JsonObject[] =>
  asArray(snapshot.messages, "snapshot messages").flatMap((message) => {
    if (!isJsonObject(message)) {
      return [];
    }
    return asArray(message.parts, "message parts").filter(
      (part): part is JsonObject =>
        isJsonObject(part) && part.type === "dynamic-tool",
    );
  });

const toolOf = (snapshot: JsonObject, callId: string): JsonObject => {
  const found = toolsOf(snapshot).filter((part) => part.toolCallId === callId);
  assert.ok(
    found.length === 1 && found[0]?.state === "output-available",
    `exact completed tool: ${callId}`,
  );
  const tool = found[0];
  assert.ok(tool);
  return tool;
};

const require = (condition: unknown, message: string): void => {
  assert.ok(condition, message);
};

export const auditReopenedWhyRetention = (
  data: RetentionBundle,
): JsonObject => {
  const seed = asObject(data.seed, "seed");
  const pids = (["create", "fold", "reopen"] as const).map((phase) => {
    const processRecord = asObject(
      data[`${phase}-process`],
      `${phase} process`,
    );
    return processRecord.pid;
  });
  require(new Set(pids).size === 3, "distinct actual process IDs");
  for (const phase of ["create", "fold", "reopen"] as const) {
    const processRecord = asObject(
      data[`${phase}-process`],
      `${phase} process`,
    );
    const result = asObject(data[`${phase}-result`], `${phase} result`);
    require(result.pid === processRecord.pid, "process/result PID correlation");
    require(result.dbPath === seed.dbPath, "same original store path");
    require(result.outcome === "pass", "actual phase pass");
  }
  require(seed.pid === pids[0], "seed PID correlation");
  const baseline = asObject(data["create-history"], "create-history");
  const sourceMatches = asArray(baseline.messages, "baseline messages").filter(
    (message): message is JsonObject =>
      isJsonObject(message) && message.id === seed.sourceId,
  );
  require(sourceMatches.length === 1, "source exact identity/content");
  const source = sourceMatches[0];
  assert.ok(source);
  require(source.role === "user" &&
    source.purpose === "user", "source authorized role/purpose");
  require(textOf(source) === sourceText, "source exact identity/content");
  const protectedTools = toolsOf(baseline).filter((part) =>
    ["update_workpiece", "addArc", "getLatestNetDefinition"].includes(
      String(part.toolName),
    ),
  );
  require(protectedTools.length ===
    6, "three revisions, two reads, one mutation; no tool reissue");
  for (const number of [1, 2, 3]) {
    const revision = toolOf(baseline, `retention-revision-${number}`);
    const pointer = asObject(revision.output, "revision output");
    require(pointer.revisionId === revision.toolCallId &&
      pointer.ordinal === number, "revision identity/ordinal");
    require(isJsonObject(revision.input) &&
      typeof revision.input.markdown === "string" &&
      createHash("sha256").update(revision.input.markdown).digest("hex") ===
        pointer.sha256, "revision content hash");
    require(pointer.evidenceValidated === true, "validated revision evidence");
    const seedGoverning = asObject(seed.governing, "seed governing");
    require(JSON.stringify(pointer.evidence) ===
      JSON.stringify(seedGoverning.evidence) &&
      asArray(pointer.evidence, "revision evidence").length ===
        2, "overlapping carried evidence exact");
    if (number > 1) {
      require(isJsonObject(revision.input) &&
        !("evidence" in revision.input), "raw carried input not rewritten");
    }
  }
  const original = asObject(
    toolOf(baseline, "retention-live-why").output,
    "original why",
  );
  require(isJsonObject(original.reconciliation) &&
    original.reconciliation.status ===
      "live-observed", "creation actual live observation");
  for (const name of snapshotNames) {
    const snapshot = asObject(data[name], name);
    require(JSON.stringify(
      asArray(snapshot.messages, `${name} messages`).filter(
        (message) => isJsonObject(message) && message.id === seed.sourceId,
      ),
    ) === JSON.stringify([source]), "source exact identity/content");
    require(JSON.stringify(
      toolsOf(snapshot).filter((part) =>
        ["update_workpiece", "addArc", "getLatestNetDefinition"].includes(
          String(part.toolName),
        ),
      ),
    ) === JSON.stringify(protectedTools), "protected tools exact; no reissue");
    for (const message of asArray(baseline.messages, "baseline messages")) {
      if (!isJsonObject(message)) {
        continue;
      }
      require(JSON.stringify(
        asArray(snapshot.messages, `${name} messages`).filter(
          (entry) => isJsonObject(entry) && entry.id === message.id,
        ),
      ) === JSON.stringify([message]), "baseline public messages exact");
    }
  }
  for (const name of queryNames) {
    const query = asObject(data[name], name);
    const read = asObject(query.read, `${name} read`);
    require(JSON.stringify(read.currentWorkpiece) ===
      JSON.stringify(original.currentWorkpiece), "actual current state exact");
    for (const label of ["why", "oldObservationWhy"] as const) {
      const answer = asObject(query[label], `${name} ${label}`);
      require(JSON.stringify(answer.governing) ===
        JSON.stringify(
          original.governing,
        ), "governing revision/hash/passages/relations exact");
      require(JSON.stringify(answer.recordedChange) ===
        JSON.stringify(
          original.recordedChange,
        ), "actual recorded effects exact");
      require(isJsonObject(answer.reconciliation) &&
        answer.reconciliation.status ===
          "as-of", "restart is as-of, not fresh browser");
      require(answer.disposition === "partially-supported" &&
        answer.untrusted === true, "honest partial untrusted standing");
    }
    const oldWhy = asObject(query.oldObservationWhy, `${name} old why`);
    require(isJsonObject(oldWhy.reconciliation) &&
      oldWhy.reconciliation.observationScope ===
        "as-of", "old ID cannot earn freshness");
    require(asObject(query.refusedObservationWhy, `${name} refused`)
      .disposition === "refused", "unknown observation refuses");
    if (name !== "process-restarted-before-fold") {
      require(asArray(read.sources, `${name} sources`).some(
        (item) => isJsonObject(item) && item.id === seed.sourceId,
      ), "seed source remains discoverable");
      const phase = name.startsWith("fold") ? "fold" : "reopen";
      const request = asObject(
        asArray(data[`${phase}-contexts`], `${phase} contexts`)[
          Number(query.beforeRequestContextIndex)
        ],
        `${name} request context`,
      );
      require(request.purpose === "agent", "actual query request context");
      const context = asObject(request.context, `${name} context`);
      const serialized = JSON.stringify(context.messages);
      require(serialized.includes(
        "A5 controlled lossy summary",
      ), "real folded summary consumed");
      require(!serialized.includes(
        sourceText,
      ), "original true-user source entry absent from query context");
      require(!asArray(context.messages, `${name} context messages`).some(
        (message) =>
          isJsonObject(message) &&
          message.role === "toolResult" &&
          (message.toolName === "brunch_workpiece" ||
            message.toolName === "brunch_why"),
      ), "prior workpiece/why results absent from query context");
      require(!asArray(query.priorQueryIds, `${name} prior query ids`).some(
        (callId) => serialized.includes(String(callId)),
      ), "prior query IDs absent even with redacted source text");
    }
  }
  const foldEvents = asArray(data["fold-events"], "fold-events");
  const starts = foldEvents.filter(
    (event) => isJsonObject(event) && event.type === "compaction_start",
  );
  const compactions = foldEvents.filter(
    (event) => isJsonObject(event) && event.type === "compaction",
  );
  require(starts.length >= 2 &&
    starts.every(
      (event) => isJsonObject(event) && event.reason === "threshold",
    ), "real threshold compaction, never overflow substitute");
  require(compactions.length >= 2 &&
    compactions.every(
      (event) =>
        isJsonObject(event) &&
        event.isError === false &&
        Number(event.messagesAfter) < Number(event.messagesBefore),
    ), "successful real context folding");
  const pins = asArray(data["fold-completion-pins"], "fold-completion-pins");
  require(pins.length >= 22, "nonempty independent completion pins");
  for (const pinValue of pins) {
    const pin = asObject(pinValue, "completion pin");
    const records = asArray(pin.records, "pin records");
    const startRecords = records.filter(
      (record) =>
        isJsonObject(record) && record.type === "assistant_message_started",
    );
    const endRecords = records.filter(
      (record) =>
        isJsonObject(record) && record.type === "assistant_message_completed",
    );
    require(startRecords.length === 1 &&
      endRecords.length === 1, "canonical completion exists exactly once");
    const start = asObject(startRecords[0], "pin start");
    const end = asObject(endRecords[0], "pin end");
    const body = records
      .filter(
        (record): record is JsonObject =>
          isJsonObject(record) && record.type === "assistant_text_delta",
      )
      .map((record) => String(record.delta))
      .join("");
    const expected = {
      id: start.messageId,
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      submissionId: start.submissionId,
      turnId: start.turnId,
      parts: [{ type: "text", text: body, state: "done" }],
    };
    require(JSON.stringify(pin.message) === JSON.stringify(expected) &&
      end.messageId === start.messageId &&
      end.stopReason ===
        "stop", "pin matches independent canonical completion");
    const event = asObject(pin.event, "pin event");
    require(event.turnId === start.turnId &&
      event.submissionId ===
        start.submissionId, "completion event correlation");
    for (const name of [
      "fold-history",
      "reopen-before",
      "reopen-history",
    ] as const) {
      const snapshot = asObject(data[name], name);
      require(JSON.stringify(
        asArray(snapshot.messages, `${name} messages`).filter(
          (message) => isJsonObject(message) && message.id === expected.id,
        ),
      ) ===
        JSON.stringify([
          expected,
        ]), "independently pinned completed response exact");
      require(JSON.stringify(
        asArray(snapshot.settlements, `${name} settlements`).filter(
          (item) =>
            isJsonObject(item) && item.submissionId === expected.submissionId,
        ),
      ) ===
        JSON.stringify([
          {
            submissionId: expected.submissionId,
            outcome: "completed",
            answeredBySubmissionId: expected.submissionId,
          },
        ]), "independently pinned completed settlement exact");
    }
    for (const phase of ["fold", "reopen"] as const) {
      const settlements = asArray(
        data[`${phase}-canonical-settlements`],
        `${phase} canonical settlements`,
      ).filter(
        (item) =>
          isJsonObject(item) && item.submissionId === expected.submissionId,
      );
      require(settlements.length === 1 &&
        isJsonObject(settlements[0]) &&
        settlements[0].outcome === "completed", "canonical settlement exact");
    }
  }
  return {
    pids,
    sameOriginalStore: seed.dbPath,
    completionPins: pins.length,
    thresholdCompactions: compactions.length,
    sourceId: seed.sourceId,
    governingRevision: asObject(seed.governing, "seed governing").revisionId,
  };
};

const falsifierCases = [
  ["source-omission", "source exact"],
  ["source-change", "source exact"],
  ["carried-relation-loss", "overlapping carried evidence"],
  ["completion-omission", "independently pinned completed response"],
  ["completion-duplicate", "independently pinned completed response"],
  ["settlement-omission", "independently pinned completed settlement"],
  ["same-pid", "distinct actual process"],
  ["false-live", "restart is as-of"],
  ["source-still-in-context", "original true-user source entry absent"],
  ["redacted-answer-still-in-context", "prior workpiece/why results absent"],
] as const;

export const falsifyReopenedWhyRetention = (
  original: RetentionBundle,
): {
  readonly mode: string;
  readonly rejected: true;
  readonly reason: string;
}[] => {
  const results: {
    readonly mode: string;
    readonly rejected: true;
    readonly reason: string;
  }[] = [];
  for (const [mode, expected] of falsifierCases) {
    const data = structuredClone(original);
    const seed = asObject(data.seed, "seed");
    const pins = asArray(data["fold-completion-pins"], "pins");
    const pin = asObject(asObject(pins[0], "first pin").message, "pin message");
    for (const name of snapshotNames) {
      const snapshot = asObject(data[name], name);
      if (mode === "source-omission") {
        snapshot.messages = asArray(
          snapshot.messages,
          `${name} messages`,
        ).filter(
          (message) => !(isJsonObject(message) && message.id === seed.sourceId),
        );
      }
      if (mode === "source-change") {
        for (const message of asArray(snapshot.messages, `${name} messages`)) {
          if (isJsonObject(message) && message.id === seed.sourceId) {
            message.parts = [
              { type: "text", text: "Mutated source", state: "done" },
            ];
          }
        }
      }
      if (mode === "carried-relation-loss") {
        const evidence = asArray(
          asObject(
            toolOf(snapshot, "retention-revision-2").output,
            "revision 2",
          ).evidence,
          "revision 2 evidence",
        );
        evidence.pop();
      }
      if (mode === "completion-omission") {
        snapshot.messages = asArray(
          snapshot.messages,
          `${name} messages`,
        ).filter(
          (message) => !(isJsonObject(message) && message.id === pin.id),
        );
      }
      if (
        mode === "completion-duplicate" &&
        asArray(snapshot.messages, `${name} messages`).some(
          (message) => isJsonObject(message) && message.id === pin.id,
        )
      ) {
        asArray(snapshot.messages, `${name} messages`).push(
          structuredClone(pin),
        );
      }
      if (mode === "settlement-omission") {
        snapshot.settlements = asArray(
          snapshot.settlements,
          `${name} settlements`,
        ).filter(
          (item) =>
            !(isJsonObject(item) && item.submissionId === pin.submissionId),
        );
      }
    }
    if (mode === "same-pid") {
      asObject(data["reopen-process"], "reopen process").pid = asObject(
        data["create-process"],
        "create process",
      ).pid;
    }
    if (mode === "false-live") {
      asObject(
        asObject(data["reopen-after-compaction"], "reopen query").why,
        "reopen why",
      ).reconciliation = {
        ...asObject(
          asObject(
            asObject(data["reopen-after-compaction"], "reopen query").why,
            "why",
          ).reconciliation,
          "reconciliation",
        ),
        status: "live-observed",
      };
    }
    if (mode === "source-still-in-context") {
      const query = asObject(
        data["reopen-after-compaction"],
        "reopen-after-compaction",
      );
      const contexts = asArray(data["reopen-contexts"], "reopen-contexts");
      const request = asObject(
        contexts[Number(query.beforeRequestContextIndex)],
        "reopen request",
      );
      const context = asObject(request.context, "reopen context");
      const baseline = asObject(original["create-history"], "create-history");
      const source = asArray(baseline.messages, "baseline messages").find(
        (message) => isJsonObject(message) && message.id === seed.sourceId,
      );
      assert.ok(isJsonObject(source));
      asArray(context.messages, "context messages").push({
        role: "user",
        content: textOf(source),
      });
    }
    if (mode === "redacted-answer-still-in-context") {
      const query = asObject(
        data["reopen-after-compaction"],
        "reopen-after-compaction",
      );
      const contexts = asArray(data["reopen-contexts"], "reopen-contexts");
      const request = asObject(
        contexts[Number(query.beforeRequestContextIndex)],
        "reopen request",
      );
      const context = asObject(request.context, "reopen context");
      const answer = structuredClone(asObject(query.why, "reopen why"));
      const governing = asObject(answer.governing, "governing");
      for (const passage of asArray(governing.passages, "passages")) {
        if (!isJsonObject(passage)) {
          continue;
        }
        for (const relation of asArray(passage.relations, "relations")) {
          if (isJsonObject(relation)) {
            relation.sources = [];
          }
        }
      }
      asArray(context.messages, "context messages").push({
        role: "toolResult",
        toolName: "brunch_why",
        toolCallId: "retention-live-why",
        content: [{ type: "text", text: JSON.stringify(answer) }],
      });
    }
    try {
      auditReopenedWhyRetention(data);
      throw new Error(`Falsifier escaped: ${mode}`);
    } catch (error) {
      assert.ok(error instanceof Error);
      require(error.message.includes(
        expected,
      ), `Wrong discriminator for ${mode}: ${error.message}`);
      results.push({ mode, rejected: true, reason: error.message });
    }
  }
  return results;
};

export const loadReopenedWhyRetention = (
  directory: string,
): RetentionBundle => {
  const names = [...snapshotNames, ...queryNames, ...extraNames];
  return Object.fromEntries(
    names.map((name) => [name, loadNamed(directory, name)]),
  );
};
