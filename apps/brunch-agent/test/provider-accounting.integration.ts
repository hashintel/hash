/** TEST INPUT/OUTPUT only: built registration, synthetic SDK responses, disposable ledger. */
/* eslint-disable no-await-in-loop -- One synthetic provider queue, exercised serially. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Provider,
} from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { observe } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { installFauxProvider } from "../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

const childMode = process.argv[2];
const directory =
  process.argv[3] ?? mkdtempSync(join(tmpdir(), "TEST-provider-accounting-"));
const ledgerPath = join(directory, "usage-ledger.json");
process.env.HASH_OTLP_ENDPOINT = "";
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(
  directory,
  `conversation-${childMode ?? "parent"}.db`,
);
if (childMode === "--disabled") delete process.env.BRUNCH_STEP_A_ACCOUNTING;
else
  process.env.BRUNCH_STEP_A_ACCOUNTING = JSON.stringify({
    ledgerPath,
    runId: "TEST-run",
  });

const fixture = (active = true) => ({
  authority: "TEST INPUT — not paid authorization",
  limits: { calls: 200, usd: 100 },
  reservation: {
    owner: "TEST",
    runId: "TEST-run",
    status: active ? "active" : "released",
    calls: 2,
    usd: 20,
    perCall: { maxOutputTokens: 16, reservedUsd: 7 },
  },
  totals: {
    spentCalls: 0,
    spentUsd: 0,
    remainingCalls: 200,
    remainingUsd: 100,
    outstandingReservedCalls: 0,
    outstandingReservedUsd: 0,
  },
  calls: [] as {
    sequence: number;
    status: string;
    invocation: string;
    transport: string;
    actualUsd?: number;
    usage?: AssistantMessage["usage"];
    terminal?: { usage: AssistantMessage["usage"] };
    identity: {
      instanceId: string;
      conversationId: string;
      submissionId: string;
      operationId: string;
      turnId: string;
    };
  }[],
});
const readLedger = () =>
  JSON.parse(readFileSync(ledgerPath, "utf8")) as ReturnType<typeof fixture>;
const reset = (input = fixture()) => {
  writeFileSync(ledgerPath, `${JSON.stringify(input, null, 2)}\n`);
  writeFileSync(
    join(directory, "attempt-ledger.md"),
    "# TEST INPUT/OUTPUT attempts\n",
  );
};
if (!childMode) reset(fixture(false));
const native: Provider = anthropicProvider();
const model = native
  .getModels()
  .find((entry) => entry.id === "claude-sonnet-4-6");
assert(model);
let starts = 0;
let syntheticFetches = 0;
const fetchCount = () => syntheticFetches;
let forbiddenFetches = 0;
let scenario = "accepted";
let lateStream = createAssistantMessageEventStream();
const requestIdentities: unknown[] = [];
const turns: {
  conversationId?: string;
  submissionId?: string;
  operationId?: string;
  turnId?: string;
}[] = [];
const stopObserving = observe((event) => {
  if (event.type === "turn_request")
    turns.push({
      conversationId: event.conversationId,
      submissionId: event.submissionId,
      operationId: event.operationId,
      turnId: event.turnId,
    });
});
const encode = (event: { type: string; [key: string]: unknown }) =>
  new TextEncoder().encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url !== "https://api.anthropic.com/v1/messages") {
    forbiddenFetches++;
    throw new Error("External requests forbidden");
  }
  syntheticFetches++;
  if (childMode !== "--disabled") {
    const row = readLedger().calls.at(-1);
    assert.equal(
      row?.status,
      "unknown",
      "unresolved marker must already be persisted before SDK dispatch",
    );
    assert.equal(row.transport, "started");
    requestIdentities.push(row.identity);
  }
  assert.equal(typeof init?.body, "string");
  const payload = JSON.parse(init?.body as string) as {
    max_tokens: number;
    model: string;
  };
  if (childMode !== "--disabled") assert.equal(payload.max_tokens, 16);
  assert.equal(payload.model, model.id);
  return new Response(
    new ReadableStream({
      start(controller) {
        if (scenario === "late" || scenario === "never") {
          controller.close();
          return;
        }
        init?.signal?.addEventListener(
          "abort",
          () => controller.error(new Error("TEST transport aborted")),
          { once: true },
        );
        if (scenario === "zero") return;
        controller.enqueue(
          encode({
            type: "message_start",
            message: {
              id: "msg_TEST_accounting",
              type: "message",
              role: "assistant",
              model: model.id,
              content: [],
              stop_reason: null,
              usage: {
                input_tokens: 100,
                output_tokens: 1,
                cache_read_input_tokens: 20,
                cache_creation_input_tokens: 30,
                cache_creation: { ephemeral_1h_input_tokens: 5 },
              },
            },
          }),
        );
        if (scenario === "partial") return;
        if (scenario === "rejected") {
          for (const [index, name] of [
            "mutate_workpiece",
            "addType",
          ].entries()) {
            controller.enqueue(
              encode({
                type: "content_block_start",
                index,
                content_block: {
                  type: "tool_use",
                  id: `TEST-call-${index}`,
                  name,
                  input: {},
                },
              }),
            );
            controller.enqueue(
              encode({
                type: "content_block_delta",
                index,
                delta: { type: "input_json_delta", partial_json: "{}" },
              }),
            );
            controller.enqueue(encode({ type: "content_block_stop", index }));
          }
        } else {
          controller.enqueue(
            encode({
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            }),
          );
          controller.enqueue(
            encode({
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "text_delta",
                text: "TEST accepted accounting control",
              },
            }),
          );
          controller.enqueue(encode({ type: "content_block_stop", index: 0 }));
        }
        controller.enqueue(
          encode({
            type: "message_delta",
            delta: {
              stop_reason: scenario === "rejected" ? "tool_use" : "end_turn",
            },
            usage: {
              output_tokens: 10,
              output_tokens_details: { thinking_tokens: 3 },
            },
          }),
        );
        controller.enqueue(encode({ type: "message_stop" }));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};
const provider: Provider = {
  ...native,
  streamSimple(selected, context, options) {
    starts++;
    if (childMode === "--crash-launch") process.exit(73);
    assert.equal(
      options?.maxRetries,
      childMode === "--disabled" ? undefined : 0,
    );
    if (scenario === "late" || scenario === "never") {
      // In-memory signal-ignoring native boundary: invoke the accounted transport
      // seam, then deliberately settle result() independently of iterator disposal.
      void options?.fetch?.("https://api.anthropic.com/v1/messages", {
        body: JSON.stringify({ max_tokens: 16, model: model.id }),
      });
      return lateStream;
    }
    return native.streamSimple(selected, context, {
      ...options,
      apiKey: "TEST-not-a-credential",
    });
  },
};
installFauxProvider(provider);
const application = await loadBuiltBrunchApplication();
let ordinal = 0;
const clientFor = () => {
  const identity = {
    principalKey: "TEST-accounting",
    conversationId: `TEST-case-${childMode ?? "parent"}-${++ordinal}`,
  };
  const instanceId = flueConversationIdFrom(identity);
  return {
    instanceId,
    client: createFlueClient({
      url: `http://brunch.local/agents/chat/${instanceId}`,
      headers: agentOwnershipHeaders(identity),
      fetch: async (input, init) =>
        application.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
    }),
  };
};
const waitUntil = async (condition: () => boolean) => {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    assert(Date.now() < deadline, "TEST observation did not arrive");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
const submit = async () => {
  const { client, instanceId } = clientFor();
  const receipt = await client.send({
    message: { kind: "user", body: "TEST accounting request" },
  });
  let failure = false;
  await client.wait(receipt).catch(() => {
    failure = true;
  });
  return { client, receipt, instanceId, failure };
};
const observations: unknown[] = [];
try {
  if (childMode) {
    const before = readFileSync(ledgerPath, "utf8");
    const outcome = await submit();
    assert.equal(starts, childMode === "--disabled" ? 1 : 0);
    assert.equal(outcome.failure, childMode !== "--disabled");
    assert.equal(readFileSync(ledgerPath, "utf8"), before);
  } else {
    for (const refusal of [
      "unreserved",
      "exhausted",
      "invalid",
      "underfunded",
    ] as const) {
      const input = fixture(refusal !== "unreserved");
      if (refusal === "exhausted") input.limits.calls = 1; // Inconsistent totals must also fail closed.
      if (refusal === "invalid") input.reservation.perCall.maxOutputTokens = -1;
      if (refusal === "underfunded")
        input.reservation.perCall.reservedUsd = 0.01;
      reset(input);
      const beforeStarts = starts;
      assert.equal((await submit()).failure, true);
      assert.equal(starts, beforeStarts);
      observations.push({ case: refusal, nativeStarts: 0 });
    }
    for (const completed of ["accepted", "rejected"]) {
      reset();
      scenario = completed;
      const beforeStarts = starts;
      const outcome = await submit();
      assert.equal(outcome.failure, completed === "rejected");
      assert.equal(starts - beforeStarts, 1);
      const ledger = readLedger();
      const row = ledger.calls.at(0)!;
      assert.equal(row.status, "complete");
      assert.equal(row.usage?.totalTokens, 160);
      assert.equal(row.usage.reasoning, 3);
      assert.equal(row.usage.cacheWrite1h, 5);
      assert(Math.abs(ledger.totals.spentUsd - 0.00057975) < 1e-12);
      assert.equal(ledger.totals.spentCalls, 1);
      assert.equal(ledger.totals.outstandingReservedUsd, 0);
      assert.equal(row.identity.instanceId, outcome.instanceId);
      assert.equal(row.identity.submissionId, outcome.receipt.submissionId);
      const turn = turns.find((entry) => entry.turnId === row.identity.turnId);
      assert(turn);
      assert.equal(row.identity.conversationId, turn.conversationId);
      assert.equal(row.identity.operationId, turn.operationId);
      assert.equal(row.identity.submissionId, turn.submissionId);
      const history = await outcome.client.history();
      const publishedTools = history.messages.flatMap((message) =>
        message.parts.filter((part) => part.type === "dynamic-tool"),
      );
      if (completed === "rejected") assert.deepEqual(publishedTools, []);
      observations.push({
        case: completed,
        ledger,
        turn,
        receipt: outcome.receipt,
        publishedTools: publishedTools.length,
      });
      // Consume the bounded allocation; the next attempt is refused without native start.
      ledger.reservation.calls = 1;
      writeFileSync(ledgerPath, JSON.stringify(ledger));
      const beforeExhausted = starts;
      assert.equal((await submit()).failure, true);
      assert.equal(starts, beforeExhausted);
    }
    for (const cancelled of ["partial", "zero", "late", "never"]) {
      reset();
      scenario = cancelled;
      lateStream = createAssistantMessageEventStream();
      const { client } = clientFor();
      const beforeFetch = syntheticFetches;
      const receipt = await client.send({
        message: { kind: "user", body: "TEST cancellation" },
      });
      await waitUntil(() => fetchCount() > beforeFetch);
      if (cancelled === "partial")
        await waitUntil(() => readLedger().calls.at(0)?.usage?.input === 100);
      await client.abort();
      await client.wait(receipt).catch(() => {});
      if (cancelled === "partial" || cancelled === "zero")
        await waitUntil(() => readLedger().calls.at(0)?.terminal !== undefined);
      const atCancellation = readLedger();
      assert.equal(atCancellation.calls.at(0)?.status, "unknown");
      assert.equal(
        atCancellation.calls.at(0)?.usage?.totalTokens,
        cancelled === "partial" ? 151 : cancelled === "zero" ? 0 : undefined,
      );
      assert.equal(atCancellation.totals.outstandingReservedUsd, 7);
      assert.equal(atCancellation.totals.spentCalls, 1);
      const beforeNext = starts;
      assert.equal((await submit()).failure, true);
      assert.equal(starts, beforeNext);
      const beforeLateHistory = await client.history();
      if (cancelled === "late") {
        const message: AssistantMessage = {
          role: "assistant",
          api: model.api,
          provider: model.provider,
          model: model.id,
          content: [{ type: "text", text: "TEST forbidden late output" }],
          stopReason: "stop",
          timestamp: 0,
          usage: {
            input: 100,
            output: 10,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 110,
            cost: {
              input: 0.0003,
              output: 0.00015,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0.00045,
            },
          },
        };
        lateStream.push({ type: "done", reason: "stop", message });
        // Duplicate terminal delivery is the same native completion, not a second call.
        lateStream.push({ type: "done", reason: "stop", message });
        await waitUntil(() => readLedger().calls.at(0)?.terminal !== undefined);
        assert.deepEqual(await client.history(), beforeLateHistory);
        assert.equal(readLedger().totals.spentCalls, 1);
        assert.equal(readLedger().totals.outstandingReservedUsd, 7);
        assert.equal(readLedger().calls.at(0)?.usage?.totalTokens, 110);
      }
      observations.push({
        case: cancelled,
        atCancellation,
        after: readLedger(),
      });
    }
    // Abrupt process death at the native entrypoint, after durable reservation,
    // before even synthetic SDK dispatch. No finally/observer can reconcile it.
    reset();
    const crash = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        import.meta.filename,
        "--crash-launch",
        directory,
      ],
      { encoding: "utf8", env: process.env, timeout: 30_000 },
    );
    assert.equal(crash.status, 73, crash.stderr);
    assert.equal(readLedger().calls.at(0)?.status, "unknown");
    assert.equal(readLedger().calls.at(0)?.transport, "not-started");
    observations.push({
      case: "abrupt-process-death",
      exitCode: crash.status,
      ledger: readLedger(),
    });
    const beforeRestart = readFileSync(ledgerPath, "utf8");
    for (const mode of ["--restart", "--disabled"]) {
      const child = spawnSync(
        process.execPath,
        ["--experimental-strip-types", import.meta.filename, mode, directory],
        { encoding: "utf8", env: process.env, timeout: 30_000 },
      );
      assert.equal(child.status, 0, `TEST child ${mode}: ${child.stderr}`);
      assert.equal(readFileSync(ledgerPath, "utf8"), beforeRestart);
      observations.push({
        case: mode,
        exitCode: child.status,
        ledgerUnchanged: true,
      });
    }
    assert.equal(forbiddenFetches, 0);
    const report = {
      scope:
        "TEST INPUT/OUTPUT — unpaid readiness, catalogue estimates not invoice amounts",
      directory,
      starts,
      syntheticFetches,
      forbiddenFetches,
      requestIdentities,
      observations,
    };
    writeFileSync(
      join(directory, "request-accounting.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    process.stdout.write(
      `PROVIDER_ACCOUNTING ${JSON.stringify({ passed: true, directory, starts, syntheticFetches, cases: observations.length })}\n`,
    );
  }
} finally {
  stopObserving();
  await application.stop();
}
