// Evidence-only accounting experiment below the unchanged production decorator.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";

import { Agent } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Provider,
} from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

import { withBufferedToolAdmission } from "../../../../../../../../apps/brunch-agent/src/provider-admission.ts";

import type { PromptUsage } from "@flue/runtime";

// Same installed normalizer used by Session.emitTurn / response aggregation.
// Evidence-only private import, not a production dependency.
const { nt: fromProviderUsage } = (await import(
  new URL("./dispatch-nU3cIlT-.mjs", import.meta.resolve("@flue/runtime")).href
)) as { nt: (usage: AssistantMessage["usage"]) => PromptUsage };
const native = anthropicProvider();
const model = native
  .getModels()
  .find((entry) => entry.id === "claude-sonnet-4-6");
assert(model);
const observations: unknown[] = [];
let networkAttempts = 0;
globalThis.fetch = async () => {
  networkAttempts++;
  throw new Error("External network forbidden");
};
const deferred = <Value>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
};
const metadata = (message: AssistantMessage) => ({
  provider: message.provider,
  model: message.model,
  responseId: message.responseId,
  stopReason: message.stopReason,
  usage: structuredClone(message.usage),
});
const sse = (event: { type: string; [key: string]: unknown }) =>
  new TextEncoder().encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
const start = {
  type: "message_start",
  message: {
    id: "msg_synthetic_usage",
    type: "message",
    role: "assistant",
    model: model.id,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 1,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 30,
      cache_creation: { ephemeral_1h_input_tokens: 5 },
    },
  },
};
const proposal = ["update_workpiece", "addArc"].flatMap((name, index) => [
  {
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id: `synthetic_${index}`,
      name,
      input: {},
    },
  },
  {
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: "{}" },
  },
  { type: "content_block_stop", index },
]);
const finish = [
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: { output_tokens: 10, output_tokens_details: { thinking_tokens: 3 } },
  },
  { type: "message_stop" },
];

// Observe result() once at provider start. This promise is independent of iterator
// disposal, so a late terminal result can still account without reopening admission.
// Iterator observation only snapshots progress; it never sums cumulative usage.
const meter = (base: Provider) => {
  const rows: {
    sequence: number;
    partial?: ReturnType<typeof metadata>;
    terminal?: ReturnType<typeof metadata>;
  }[] = [];
  const pending: Promise<void>[] = [];
  const progress = deferred<void>();
  const record = (stream: AssistantMessageEventStream) => {
    const row: (typeof rows)[number] = { sequence: rows.length + 1 };
    rows.push(row);
    pending.push(
      stream.result().then((message) => {
        row.terminal = metadata(message);
      }),
    );
    const iterator = stream[Symbol.asyncIterator].bind(stream);
    stream[Symbol.asyncIterator] = async function* () {
      for await (const event of { [Symbol.asyncIterator]: iterator }) {
        if ("partial" in event) {
          row.partial = metadata(event.partial);
          if (event.type === "toolcall_end") progress.resolve();
        }
        yield event;
      }
    };
    return stream;
  };
  const provider: Provider = {
    ...base,
    stream: (selected, context, options) =>
      record(base.stream(selected, context, options)),
    streamSimple: (selected, context, options) =>
      record(base.streamSimple(selected, context, options)),
  };
  return { provider, rows, pending, progress };
};
const admit = (provider: Provider) =>
  withBufferedToolAdmission(provider, () => true, new Set(["addArc"]));
const drain = async (stream: AssistantMessageEventStream) => {
  const events = [];
  let error: unknown;
  try {
    for await (const event of stream) events.push(event.type);
  } catch (caught) {
    error = caught;
  }
  return { events, error: error instanceof Error ? error.message : undefined };
};

for (const method of ["stream", "streamSimple"] as const) {
  void test(`${method}: completed rejected native synthetic response retains usage beneath admission`, async () => {
    const metered = meter(native);
    let syntheticFetchCalls = 0;
    const stream = admit(metered.provider)[method](
      model,
      { messages: [] },
      {
        apiKey: "synthetic-not-a-credential",
        maxTokens: 16,
        maxRetries: 0,
        fetch: async () => {
          syntheticFetchCalls++;
          return new Response(
            new ReadableStream({
              start(controller) {
                for (const event of [start, ...proposal, ...finish])
                  controller.enqueue(sse(event));
                controller.close();
              },
            }),
            {
              headers: {
                "content-type": "text/event-stream",
                "request-id": "req_synthetic_usage",
              },
            },
          );
        },
      },
    );
    const downstream = await drain(stream);
    await assert.rejects(stream.result(), /Mixed browser\/server proposal/);
    await Promise.all(metered.pending);
    assert.deepEqual(downstream.events, []);
    assert.match(downstream.error ?? "", /Mixed browser\/server proposal/);
    assert.equal(syntheticFetchCalls, 1);
    assert.equal(metered.rows.length, 1);
    const terminal = metered.rows[0]!.terminal!;
    assert.equal(terminal.responseId, "msg_synthetic_usage");
    assert.equal(terminal.stopReason, "toolUse");
    assert.equal(terminal.usage.totalTokens, 160);
    assert.equal(terminal.usage.reasoning, 3); // Subset, not three extra tokens.
    assert.equal(terminal.usage.cacheWrite1h, 5); // Subset, not five extra tokens.
    assert(Math.abs(terminal.usage.cost.total - 0.00057975) < 1e-12);
    // Exercise Flue's installed Agent dependency on this refused stream, without
    // another provider invocation, route, tool mount, or copied failure handler.
    const agent = new Agent({
      initialState: { model },
      streamFn: () => stream,
    });
    let failedMessage: AssistantMessage | undefined;
    agent.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant")
        failedMessage = event.message;
    });
    await agent.prompt("Synthetic failure-metering diagnostic");
    assert(failedMessage);
    assert.equal(failedMessage.stopReason, "error");
    const flueUsage = fromProviderUsage(failedMessage.usage);
    assert.equal(flueUsage.totalTokens, 0);
    assert.equal(flueUsage.cost.total, 0);
    assert.equal(metered.rows.length, 1);
    observations.push({
      case: "complete-rejected",
      method,
      syntheticFetchCalls,
      downstream,
      flueUsage,
      rows: metered.rows,
    });
  });
}

void test("cancellation after input usage retains partial native usage, not final billed cost", async () => {
  const metered = meter(native);
  const abort = new AbortController();
  let syntheticFetchCalls = 0;
  const stream = admit(metered.provider).streamSimple(
    model,
    { messages: [] },
    {
      apiKey: "synthetic-not-a-credential",
      maxTokens: 16,
      maxRetries: 0,
      signal: abort.signal,
      fetch: async (_input, init) => {
        syntheticFetchCalls++;
        return new Response(
          new ReadableStream({
            start(controller) {
              for (const event of [start, ...proposal])
                controller.enqueue(sse(event));
              init?.signal?.addEventListener(
                "abort",
                () =>
                  controller.error(new Error("Synthetic transport aborted")),
                { once: true },
              );
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    },
  );
  const downstreamPromise = drain(stream);
  await metered.progress.promise;
  abort.abort();
  const downstream = await downstreamPromise;
  await Promise.all(metered.pending);
  assert.deepEqual(downstream.events, []);
  assert.match(downstream.error ?? "", /cancelled/);
  const terminal = metered.rows[0]!.terminal!;
  assert.equal(terminal.stopReason, "aborted");
  assert.equal(terminal.usage.input, 100);
  assert.equal(terminal.usage.output, 1);
  assert.equal(terminal.usage.totalTokens, 151);
  assert(Math.abs(terminal.usage.cost.total - 0.00044475) < 1e-12);
  observations.push({
    case: "cancelled-partial-native",
    syntheticFetchCalls,
    downstream,
    rows: metered.rows,
    finalCostKnown: false,
  });
});

void test("cancellation after response headers but before usage is unknown, not free", async () => {
  const metered = meter(native);
  const abort = new AbortController();
  let syntheticFetchCalls = 0;
  const stream = admit(metered.provider).streamSimple(
    model,
    { messages: [] },
    {
      apiKey: "synthetic-not-a-credential",
      maxTokens: 16,
      maxRetries: 0,
      signal: abort.signal,
      fetch: async () => {
        syntheticFetchCalls++;
        return new Response(sse(start), {
          headers: { "content-type": "text/event-stream" },
        });
      },
      onResponse() {
        abort.abort();
      },
    },
  );
  const downstream = await drain(stream);
  await Promise.all(metered.pending);
  assert.equal(syntheticFetchCalls, 1);
  assert.deepEqual(downstream.events, []);
  const terminal = metered.rows[0]!.terminal!;
  assert.equal(terminal.stopReason, "aborted");
  assert.equal(terminal.usage.totalTokens, 0);
  assert.equal(terminal.responseId, undefined);
  observations.push({
    case: "cancelled-before-usage",
    syntheticFetchCalls,
    downstream,
    rows: metered.rows,
    finalCostKnown: false,
  });
});

void test("completed native usage survives cancellation between approval and publication", async () => {
  const metered = meter(native);
  const abort = new AbortController();
  const stream = admit(metered.provider).streamSimple(
    model,
    { messages: [] },
    {
      apiKey: "synthetic-not-a-credential",
      maxTokens: 16,
      maxRetries: 0,
      signal: abort.signal,
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              // No tool calls: a positive control with the same synthetic usage.
              for (const event of [
                start,
                {
                  type: "message_delta",
                  delta: { stop_reason: "end_turn" },
                  usage: { output_tokens: 10 },
                },
                { type: "message_stop" },
              ])
                controller.enqueue(sse(event));
              controller.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    },
  );
  const approved = await stream.result();
  assert.equal(approved.stopReason, "stop");
  abort.abort();
  const downstream = await drain(stream);
  await Promise.all(metered.pending);
  assert.deepEqual(downstream.events, []);
  assert.match(downstream.error ?? "", /cancelled/);
  assert.deepEqual(metered.rows[0]?.terminal?.usage, approved.usage);
  assert.equal(approved.usage.totalTokens, 160);
  observations.push({
    case: "completed-cancelled-before-publication",
    downstream,
    rows: metered.rows,
  });
});

void test("signal-ignoring cancellation stays unknown until late result and never reopens admission", async () => {
  const upstream = createAssistantMessageEventStream();
  let signal: AbortSignal | undefined;
  const metered = meter({
    ...native,
    streamSimple(_model, _context, options) {
      signal = options?.signal;
      return upstream;
    },
  });
  const abort = new AbortController();
  const stream = admit(metered.provider).streamSimple(
    model,
    { messages: [] },
    { signal: abort.signal },
  );
  const downstreamPromise = drain(stream);
  abort.abort();
  const downstream = await downstreamPromise;
  assert.equal(signal?.aborted, true);
  assert.equal(metered.rows[0]?.terminal, undefined);
  assert.deepEqual(downstream.events, []);
  const atCancellation = structuredClone(metered.rows);
  const late: AssistantMessage = {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [],
    timestamp: 0,
    stopReason: "stop",
    responseId: "msg_synthetic_late",
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
  upstream.push({ type: "done", reason: "stop", message: late });
  await Promise.all(metered.pending);
  await assert.rejects(stream.result(), /cancelled/);
  assert.equal(metered.rows.at(0)?.terminal?.usage.totalTokens, 110);
  observations.push({
    case: "cancelled-late-result",
    atCancellation,
    afterLateResult: metered.rows,
    downstream,
  });
});

void test("pre-aborted admission starts no underlying accounting request", async () => {
  const metered = meter(native);
  const abort = new AbortController();
  abort.abort();
  const stream = admit(metered.provider).streamSimple(
    model,
    { messages: [] },
    { signal: abort.signal },
  );
  assert.match((await drain(stream)).error ?? "", /cancelled/);
  assert.equal(metered.rows.length, 0);
  observations.push({ case: "pre-aborted", underlyingStarts: 0 });
});

void test("retain curated usage observations when requested", () => {
  assert.equal(observations.length, 7);
  assert.equal(networkAttempts, 0);
  if (process.env.PROVIDER_BOUNDARY_REPORT === "1") {
    writeFileSync(
      new URL("usage.json", import.meta.url),
      `${JSON.stringify(
        {
          scope:
            "Synthetic native SSE and in-memory providers beneath unchanged admission; estimates, not billed amounts",
          networkAttempts,
          model,
          observations,
        },
        null,
        2,
      )}\n`,
    );
  }
});
