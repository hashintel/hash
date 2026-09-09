/** TEST ONLY: actual built registration + native parser + RequestLedger, with
 * synthetic HTTPS socket events at the real-mode pinned transport boundary. */
/* eslint-disable no-await-in-loop -- One disposable ledger and built runtime, deliberately serial. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { pinnedNativeRequest } from "../src/evaluations/real-provider-a5/transport.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "TEST-a5-terminal-"));
const path = join(directory, "TEST-usage-ledger.json");
const save = (name: string, value: unknown) =>
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2));
process.env.HASH_OTLP_ENDPOINT = "";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
process.env.BRUNCH_STEP_A_ACCOUNTING = JSON.stringify({
  ledgerPath: path,
  runId: "TEST",
});
// Ordinary hermetic policy stays intact: only a synthetic auth resolver is
// supplied via the existing test factory hook. Native catalogue, stream methods,
// SDK preparation/parsing and built accounting/admission registration are real.
const native = anthropicProvider();
installFauxProvider({
  ...native,
  auth: {
    apiKey: {
      name: "TEST synthetic credential",
      resolve: async () => ({ auth: { apiKey: "TEST-not-a-credential" } }),
    },
  },
});
const reset = () => {
  save("TEST-usage-ledger.json", {
    authority: "TEST synthetic HTTPS only",
    limits: { calls: 200, usd: 100 },
    reservation: {
      runId: "TEST",
      status: "active",
      calls: 20,
      usd: 15,
      perCall: { maxOutputTokens: 4096, reservedUsd: 7 },
    },
    calls: [],
    totals: {
      spentCalls: 0,
      spentUsd: 0,
      remainingCalls: 200,
      remainingUsd: 100,
      outstandingReservedCalls: 0,
      outstandingReservedUsd: 0,
    },
  });
  writeFileSync(join(directory, "attempt-ledger.md"), "# TEST ONLY\n");
};
const ledger = () =>
  JSON.parse(readFileSync(path, "utf8")) as {
    calls: {
      status: string;
      reservedUsd: number;
      actualUsd?: number;
      terminal?: {
        stopReason: string;
        usage: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          cacheWrite1h: number;
        };
      };
    }[];
    totals: {
      spentCalls: number;
      spentUsd: number;
      outstandingReservedCalls: number;
      outstandingReservedUsd: number;
    };
  };
let scenario = "missing-terminal-usage";
let dispatches = 0;
const retained: { scenario: string; status: number; body: string }[] = [];
const nativeBody = () => {
  const terminal: Record<string, unknown> & { type: string } = {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
  };
  if (
    !["missing-terminal-usage", "created-missing-terminal"].includes(scenario)
  )
    terminal.usage =
      scenario === "missing-output"
        ? {}
        : {
            output_tokens:
              scenario === "null-output"
                ? null
                : scenario === "string-output"
                  ? "20"
                  : scenario === "negative-output"
                    ? -1
                    : scenario === "fraction-output"
                      ? 1.5
                      : scenario === "regressed-output"
                        ? 0
                        : 20,
          };
  if (scenario === "complete-multiline")
    Object.assign(terminal.usage as object, {
      input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    });
  const initial: Record<string, unknown> = {
    input_tokens: 100,
    output_tokens: 1,
  };
  const partition = (oneHour: number, fiveMinute: number) => ({
    ephemeral_1h_input_tokens: oneHour,
    ephemeral_5m_input_tokens: fiveMinute,
  });
  const deltaUsage = terminal.usage as object;
  if (
    ["complete-initial-one-hour", "late-one-hour-decrease"].includes(scenario)
  )
    Object.assign(initial, {
      cache_creation_input_tokens: 100,
      cache_creation: partition(100, 0),
    });
  if (scenario === "complete-initial-five-minute")
    Object.assign(initial, {
      cache_creation_input_tokens: 100,
      cache_creation: partition(0, 100),
    });
  if (
    [
      "complete-initial-mixed",
      "complete-mixed-nullable",
      "complete-supported-update",
      "late-partition-mismatch",
    ].includes(scenario)
  )
    Object.assign(initial, {
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 100,
      cache_creation: partition(40, 60),
    });
  if (scenario === "initial-partition-mismatch")
    Object.assign(initial, {
      cache_creation_input_tokens: 100,
      cache_creation: partition(40, 100),
    });
  if (scenario === "late-one-hour")
    Object.assign(deltaUsage, {
      cache_creation_input_tokens: 100,
      cache_creation: partition(100, 0),
    });
  if (scenario === "late-one-hour-decrease")
    Object.assign(deltaUsage, { cache_creation: partition(0, 100) });
  if (scenario === "late-partition-mismatch")
    Object.assign(deltaUsage, { cache_creation: partition(40, 100) });
  if (scenario === "input-loss") Object.assign(deltaUsage, { input_tokens: 0 });
  if (scenario === "complete-late-five-minute")
    Object.assign(deltaUsage, {
      cache_creation_input_tokens: 100,
      cache_creation: partition(0, 100),
    });
  if (scenario === "complete-supported-update")
    Object.assign(deltaUsage, {
      input_tokens: 80,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: 150,
      cache_creation: partition(40, 110),
    });
  if (scenario === "complete-input-reclassification")
    Object.assign(deltaUsage, {
      input_tokens: 0,
      cache_read_input_tokens: 100,
    });
  if (scenario === "complete-mixed-nullable")
    Object.assign(deltaUsage, {
      input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      cache_creation: null,
    });
  return [
    {
      type: "message_start",
      message: {
        id: "msg_TEST",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [],
        usage: initial,
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "text_delta",
        text: "TEST long output whose actual final usage must not be guessed",
      },
    },
    { type: "content_block_stop", index: 0 },
    terminal,
    ...(scenario === "missing-stop" ? [] : [{ type: "message_stop" }]),
  ]
    .map((frame) =>
      scenario === "complete-multiline"
        ? `event: ${frame.type}\r\n${JSON.stringify(frame, null, 2)
            .split("\n")
            .map((line) => `data: ${line}`)
            .join("\r\n")}\r\n\r\n`
        : `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`,
    )
    .join("");
};
const originalRequest = https.request;
https.request = ((
  _url: unknown,
  _options: unknown,
  callback: (
    incoming: EventEmitter & { statusCode: number; headers: object },
  ) => void,
) => {
  dispatches++;
  assert.equal(_url, "https://api.anthropic.com/v1/messages");
  const outgoing = Object.assign(new EventEmitter(), {
    end: () =>
      queueMicrotask(() => {
        const incoming = Object.assign(new EventEmitter(), {
          statusCode: scenario === "created-missing-terminal" ? 201 : 200,
          headers: { "content-type": "text/event-stream" },
        });
        callback(incoming);
        incoming.emit("data", Buffer.from(nativeBody()));
        if (scenario === "incoming-retention-error")
          incoming.emit("error", new Error("TEST incoming socket failure"));
        else if (scenario === "outgoing-retention-error")
          outgoing.emit("error", new Error("TEST outgoing socket failure"));
        else incoming.emit("end");
        outgoing.emit("close");
      }),
    destroy: (error?: Error) => {
      if (error) outgoing.emit("error", error);
      outgoing.emit("close");
    },
  });
  return outgoing;
}) as unknown as typeof https.request;
syncBuiltinESMExports();
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  pinnedNativeRequest(input, init, "127.0.0.1", (data) => {
    retained.push({
      scenario,
      status: data.status,
      body: data.body.toString(),
    });
    if (scenario.endsWith("retention-error"))
      throw new Error("TEST retention disk failure");
  });
reset();
const application = await loadBuiltBrunchApplication();
let ordinal = 0;
const submit = async () => {
  const identity = {
    principalKey: "TEST-a5-terminal",
    conversationId: `TEST-terminal-${++ordinal}`,
  };
  const client = createFlueClient({
    url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
    fetch: async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
  });
  const receipt = await client.send({
    message: {
      kind: "user",
      body: "TEST terminal accounting control, no real provider",
    },
  });
  let failed = false;
  await client
    .wait(receipt, { signal: AbortSignal.timeout(10_000) })
    .catch(() => {
      failed = true;
    });
  return { failed, history: await client.history() };
};
const outcomes: unknown[] = [];
try {
  for (const control of [
    "late-one-hour",
    "late-one-hour-decrease",
    "initial-partition-mismatch",
    "late-partition-mismatch",
    "input-loss",
    "complete-initial-one-hour",
    "complete-initial-five-minute",
    "complete-initial-mixed",
    "complete-late-five-minute",
    "complete-supported-update",
    "complete-input-reclassification",
    "complete-mixed-nullable",
    "missing-terminal-usage",
    "created-missing-terminal",
    "missing-output",
    "null-output",
    "string-output",
    "negative-output",
    "fraction-output",
    "regressed-output",
    "missing-stop",
    "incoming-retention-error",
    "outgoing-retention-error",
    "complete",
    "complete-multiline",
  ] as const) {
    scenario = control;
    reset();
    const before = dispatches;
    const first = await submit();
    const state = ledger();
    save(`${control}-first.json`, {
      ...first,
      state,
      dispatches: dispatches - before,
    });
    assert.equal(dispatches - before, 1);
    if (control.startsWith("complete")) {
      assert.equal(first.failed, false);
      assert.equal(state.calls[0]?.status, "complete");
      const positives: Record<
        string,
        {
          input: number;
          cacheRead: number;
          cacheWrite: number;
          cacheWrite1h: number;
          usd: number;
        }
      > = {
        "complete-initial-one-hour": {
          input: 100,
          cacheRead: 0,
          cacheWrite: 100,
          cacheWrite1h: 100,
          usd: 0.0012,
        },
        "complete-initial-five-minute": {
          input: 100,
          cacheRead: 0,
          cacheWrite: 100,
          cacheWrite1h: 0,
          usd: 0.000975,
        },
        "complete-initial-mixed": {
          input: 100,
          cacheRead: 20,
          cacheWrite: 100,
          cacheWrite1h: 40,
          usd: 0.001071,
        },
        "complete-mixed-nullable": {
          input: 100,
          cacheRead: 20,
          cacheWrite: 100,
          cacheWrite1h: 40,
          usd: 0.001071,
        },
        "complete-late-five-minute": {
          input: 100,
          cacheRead: 0,
          cacheWrite: 100,
          cacheWrite1h: 0,
          usd: 0.000975,
        },
        "complete-supported-update": {
          input: 80,
          cacheRead: 50,
          cacheWrite: 150,
          cacheWrite1h: 40,
          usd: 0.0012075,
        },
        "complete-input-reclassification": {
          input: 0,
          cacheRead: 100,
          cacheWrite: 0,
          cacheWrite1h: 0,
          usd: 0.00033,
        },
      };
      const expected = positives[control] ?? {
        input: 100,
        cacheRead: 0,
        cacheWrite: 0,
        cacheWrite1h: 0,
        usd: 0.0006,
      };
      const usage = state.calls[0].terminal?.usage;
      assert.deepEqual(
        {
          input: usage?.input,
          output: usage?.output,
          cacheRead: usage?.cacheRead,
          cacheWrite: usage?.cacheWrite,
          cacheWrite1h: usage?.cacheWrite1h,
        },
        {
          input: expected.input,
          output: 20,
          cacheRead: expected.cacheRead,
          cacheWrite: expected.cacheWrite,
          cacheWrite1h: expected.cacheWrite1h,
        },
      );
      assert(Math.abs(state.totals.spentUsd - expected.usd) < 1e-12);
      assert.equal(state.totals.outstandingReservedUsd, 0);
      assert.equal((await submit()).failed, false);
      assert.equal(dispatches - before, 2);
      assert.equal(ledger().calls.at(-1)?.status, "complete");
      assert(Math.abs(ledger().totals.spentUsd - 2 * expected.usd) < 1e-12);
    } else {
      assert.equal(
        state.calls[0]?.status,
        "unknown",
        "Unsupported raw billing evidence must remain unknown",
      );
      assert.equal(state.calls[0].actualUsd, undefined);
      assert.equal(state.totals.outstandingReservedUsd, 7);
      assert.equal(state.totals.outstandingReservedCalls, 1);
      assert.equal((await submit()).failed, true);
      assert.equal(
        dispatches - before,
        1,
        "Unknown usage must block the next synthetic HTTPS dispatch",
      );
      assert.equal(ledger().totals.outstandingReservedUsd, 7);
    }
    outcomes.push({
      control,
      firstFailed: first.failed,
      firstState: state,
      dispatches: dispatches - before,
    });
  }
  save("result.json", { passed: true, outcomes, retained });
  process.stdout.write(
    `${JSON.stringify({ passed: true, directory, controls: outcomes.length, dispatches, paidCalls: 0 })}\n`,
  );
} finally {
  save("retained-native.json", retained);
  await application.stop();
  globalThis.fetch = originalFetch;
  https.request = originalRequest;
  syncBuiltinESMExports();
}
