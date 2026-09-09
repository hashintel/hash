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
const optionalCounts = (usage: Record<string, unknown>) => {
  // Native message_delta permits omitted/null input/cache fields: the initial
  // input usage remains authoritative. Output usage is NOT nullable/optional.
  for (const key of [
    "input_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
  ]) {
    if (usage[key] !== undefined && usage[key] !== null) count(usage[key]);
  }
  for (const [key, counters] of [
    [
      "cache_creation",
      ["ephemeral_1h_input_tokens", "ephemeral_5m_input_tokens"],
    ],
    ["output_tokens_details", ["thinking_tokens"]],
  ] as const) {
    if (usage[key] !== undefined && usage[key] !== null) {
      const details = object(usage[key]);
      for (const counter of counters)
        if (details[counter] !== undefined && details[counter] !== null)
          count(details[counter]);
    }
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
      count(usage.input_tokens);
      outputTokens = count(usage.output_tokens);
      optionalCounts(usage);
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
          optionalCounts(usage);
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
