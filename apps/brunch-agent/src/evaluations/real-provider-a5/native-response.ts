import assert from "node:assert/strict";

import { modelId } from "./preflight.ts";

const object = (value: unknown): Record<string, unknown> => {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "Native response evidence must be an object",
  );
  return value as Record<string, unknown>;
};
const count = (value: unknown): number => {
  assert(
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    "Native token usage must be an explicit non-negative safe integer",
  );
  return value;
};
type InputEvidence = {
  input: number;
  read: number;
  write: number;
  oneHour: number;
  total: number;
};

/** Comparison registers only, never replacement SDK/ledger counters. Mirror the
 * pinned parser's omitted/null carry and initial cache defaults so every explicit
 * raw cache-tier claim can be checked against what that parser actually retains. */
const inputEvidence = (
  usage: Record<string, unknown>,
  previous?: InputEvidence,
): InputEvidence => {
  const input =
    previous && usage.input_tokens == null
      ? previous.input
      : count(usage.input_tokens);
  const read =
    usage.cache_read_input_tokens == null
      ? (previous?.read ?? 0)
      : count(usage.cache_read_input_tokens);
  const write =
    usage.cache_creation_input_tokens == null
      ? (previous?.write ?? 0)
      : count(usage.cache_creation_input_tokens);
  const partition =
    usage.cache_creation == null ? undefined : object(usage.cache_creation);
  // Pi assigns cacheWrite1h only at message_start. A later total-cache update is
  // supported; a later change of the one-hour share is not representable.
  const oneHour =
    previous?.oneHour ??
    (partition ? count(partition.ephemeral_1h_input_tokens) : 0);
  if (partition) {
    const reportedOneHour = count(partition.ephemeral_1h_input_tokens);
    const reportedFiveMinute = count(partition.ephemeral_5m_input_tokens);
    assert.equal(
      reportedOneHour,
      oneHour,
      "Late one-hour cache change is unsupported by the pinned native parser",
    );
    assert.equal(
      reportedOneHour + reportedFiveMinute,
      write,
      "Raw cache partition contradicts the reported cache-write total",
    );
  }
  assert(
    oneHour <= write,
    "Cache-write total cannot preserve the initial one-hour share",
  );
  const total = input + read + write;
  assert(
    Number.isSafeInteger(total),
    "Native input total is not a safe integer",
  );
  // These are cumulative used-input counts in the pinned protocol's disjoint
  // categories. Do not impose scalar monotonicity: supported reclassification
  // may lower input/read/write separately. Uncompensated aggregate loss remains
  // ambiguous and must not release a hold as though earlier used input vanished.
  if (previous)
    assert(
      total >= previous.total,
      "Unexplained loss of accounted native input tokens",
    );
  return { input, read, write, oneHour, total };
};
const optionalReasoningCount = (usage: Record<string, unknown>) => {
  if (usage.output_tokens_details != null) {
    const details = object(usage.output_tokens_details);
    if (details.thinking_tokens != null) count(details.thinking_tokens);
  }
};

/** Raw attestation for this buffered evaluation transport, NOT a production
 * accounting fix. Pi normalizes absent final output usage to the initial count.
 * Require the native cumulative terminal count before bytes can reach Pi.
 * This validates evidence only: never fills counters or rewrites response bytes. */
export const attestNativeResponse = (body: Buffer) => {
  const recognized = new Set([
    "message_start",
    "message_delta",
    "message_stop",
    "content_block_start",
    "content_block_delta",
    "content_block_stop",
  ]);
  let eventName = "";
  let data: string[] = [];
  let started = false;
  let terminal = false;
  let stopped = false;
  let outputTokens = 0;
  let inputs: InputEvidence | undefined;
  let messageId = "";
  let reportedModel = "";
  let stopReason = "";
  const flush = () => {
    const name = eventName;
    const payload = data.join("\n");
    eventName = "";
    data = [];
    assert(
      name !== "error",
      "Native error event cannot attest completed usage",
    );
    // Match the installed Pi SSE dispatch semantics: unknown events (e.g. ping)
    // are ignored, not mistaken for accounting evidence by their data.type.
    if (!recognized.has(name)) return;
    const frame = object(JSON.parse(payload));
    assert.equal(frame.type, name, "Native SSE event and payload type differ");
    assert(!stopped, "Native message event follows message_stop");
    if (name === "message_start") {
      assert(!started, "Duplicate native message_start");
      const message = object(frame.message);
      assert.equal(
        message.model,
        modelId,
        "Native reported model differs from the selected model",
      );
      assert(
        typeof message.id === "string" && message.id.length > 0,
        "Native response identity missing",
      );
      const usage = object(message.usage);
      inputs = inputEvidence(usage);
      outputTokens = count(usage.output_tokens);
      optionalReasoningCount(usage);
      messageId = message.id;
      reportedModel = modelId;
      started = true;
    } else {
      assert(started, "Native event precedes message_start");
      if (name === "message_stop") {
        assert(terminal, "Native message_stop lacks terminal usage evidence");
        stopped = true;
      } else {
        assert(!terminal, "Native event follows the terminal usage delta");
        if (name === "message_delta") {
          const usage = object(frame.usage);
          const nextOutput = count(usage.output_tokens);
          assert(
            nextOutput >= outputTokens,
            "Native cumulative output usage regressed",
          );
          assert(inputs, "Native input evidence is unavailable");
          inputs = inputEvidence(usage, inputs);
          optionalReasoningCount(usage);
          outputTokens = nextOutput;
          const delta = object(frame.delta);
          if (delta.stop_reason !== undefined && delta.stop_reason !== null) {
            assert(
              typeof delta.stop_reason === "string" &&
                delta.stop_reason.length > 0,
              "Native stop reason is invalid",
            );
            stopReason = delta.stop_reason;
            terminal = true;
          }
        }
      }
    }
  };
  // Same SSE line/event framing as the installed native parser, including CRLF,
  // multiline data and final EOF flush, but no JSON repair of billing evidence.
  for (const line of new TextDecoder("utf-8", { fatal: true })
    .decode(body)
    .split(/\r\n|\n|\r/u)) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith(":")) continue;
    const delimiter = line.indexOf(":");
    const field = delimiter === -1 ? line : line.slice(0, delimiter);
    let value = delimiter === -1 ? "" : line.slice(delimiter + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    else if (field === "data") data.push(value);
  }
  flush();
  assert.deepEqual(
    [started, terminal, stopped],
    [true, true, true],
    "Native response lacks complete terminal usage evidence",
  );
  return {
    messageId,
    reportedModel,
    terminalOutputTokens: outputTokens,
    stopReason,
  };
};
