import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Provider,
  type AssistantMessageEvent,
} from "@earendil-works/pi-ai";
import { expect, test, vi } from "vitest";

import {
  admissionBufferLimits,
  withBufferedToolAdmission,
} from "../src/provider-admission";

const collect = async (stream: ReturnType<Provider["streamSimple"]>) => {
  const events = [];
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result() };
};
const fixture = (active = true) => {
  const faux = fauxProvider({
    provider: "anthropic",
    models: [{ id: "synthetic", reasoning: true }],
  });
  const provider = withBufferedToolAdmission(
    faux.provider,
    () => active,
    new Set(["browser"]),
  );
  const model = provider.getModels()[0]!;
  return { faux, provider, model };
};

test.each(["stream", "streamSimple"] as const)(
  "%s rejects a complete mixed proposal before emitting anything",
  async (method) => {
    const { faux, provider, model } = fixture();
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxText("Must not escape."),
          fauxToolCall("server", {}),
          fauxToolCall("browser", {}),
        ],
        { stopReason: "toolUse" },
      ),
    ]);
    const events: AssistantMessageEvent[] = [];
    const stream = provider[method](model, { messages: [] });
    await expect(
      (async () => {
        for await (const event of stream) events.push(event);
      })(),
    ).rejects.toThrow("Mixed browser/server proposal");
    expect(events).toEqual([]);
    await expect(stream.result()).rejects.toThrow(
      "Mixed browser/server proposal",
    );
  },
);

test("leaves unrelated provider use and its streaming behavior untouched", async () => {
  const { faux, provider, model } = fixture(false);
  const response = fauxAssistantMessage(
    [fauxToolCall("server", {}), fauxToolCall("browser", {})],
    { stopReason: "toolUse" },
  );
  faux.setResponses([response]);
  const original = await collect(
    faux.provider.streamSimple(model, { messages: [] }),
  );
  faux.setResponses([response]);
  expect(
    (await collect(provider.streamSimple(model, { messages: [] }))).result,
  ).toEqual(original.result);
});

test("preserves admitted text, Unicode arguments, ids, usage and finish reason", async () => {
  const { faux, provider, model } = fixture();
  const response = fauxAssistantMessage(
    [
      fauxText("Café\r\n"),
      fauxToolCall("browser", { markdown: "  é\r\n  " }, { id: "exact-call" }),
    ],
    { stopReason: "toolUse" },
  );
  faux.setResponses([response]);
  const original = await collect(
    faux.provider.streamSimple(model, { messages: [] }),
  );
  faux.setResponses([response]);
  const result = await collect(provider.streamSimple(model, { messages: [] }));
  expect(result.result).toEqual(original.result);
  expect(
    result.events.some(
      (event) =>
        event.type === "toolcall_end" && event.toolCall.id === "exact-call",
    ),
  ).toBe(true);
});

test("cancels a signal-ignoring provider without leaking buffered or late events", async () => {
  const { faux, model } = fixture();
  const upstream = createAssistantMessageEventStream();
  let upstreamSignal: AbortSignal | undefined;
  const provider = withBufferedToolAdmission(
    {
      ...faux.provider,
      streamSimple(_model, _context, options) {
        upstreamSignal = options?.signal;
        return upstream;
      },
    },
    () => true,
    new Set(["browser"]),
  );
  const abort = new AbortController();
  const stream = provider.streamSimple(
    model,
    { messages: [] },
    { signal: abort.signal },
  );
  const pending = collect(stream);
  const assertion = expect(pending).rejects.toThrow("cancelled");
  abort.abort();
  await assertion;
  expect(upstreamSignal?.aborted).toBe(true);
  const late = fauxAssistantMessage([
    fauxText("Late output must be discarded."),
  ]);
  upstream.push({ type: "done", reason: "stop", message: late });
  await expect(stream.result()).rejects.toThrow("cancelled");
});

test("refuses oversize buffering and aborts the upstream", async () => {
  const { faux, provider, model } = fixture();
  faux.setResponses([
    fauxAssistantMessage([
      fauxText("x".repeat(admissionBufferLimits.bytes + 1)),
    ]),
  ]);
  await expect(
    collect(provider.streamSimple(model, { messages: [] })),
  ).rejects.toThrow("buffering limit");
});

test("pre-aborted calls never start the upstream provider", async () => {
  const { faux, model } = fixture();
  const start = vi.fn<Provider["streamSimple"]>(() =>
    createAssistantMessageEventStream(),
  );
  const provider = withBufferedToolAdmission(
    { ...faux.provider, streamSimple: start },
    () => true,
    new Set(["browser"]),
  );
  const abort = new AbortController();
  abort.abort();
  await expect(
    collect(
      provider.streamSimple(model, { messages: [] }, { signal: abort.signal }),
    ),
  ).rejects.toThrow("cancelled");
  expect(start).not.toHaveBeenCalled();
});

test("cancellation after approval but before replay still releases no events", async () => {
  const { faux, provider, model } = fixture();
  faux.setResponses([
    fauxAssistantMessage([fauxText("Approved but not yet released.")]),
  ]);
  const abort = new AbortController();
  const stream = provider.streamSimple(
    model,
    { messages: [] },
    { signal: abort.signal },
  );
  await stream.result();
  abort.abort();
  const events: AssistantMessageEvent[] = [];
  await expect(
    (async () => {
      for await (const event of stream) events.push(event);
    })(),
  ).rejects.toThrow("cancelled");
  expect(events).toEqual([]);
});

test("checks the tool inputs Flue publishes as well as the final response calls", async () => {
  const { faux, model } = fixture();
  const upstream = createAssistantMessageEventStream();
  const message = fauxAssistantMessage([fauxToolCall("server", {})], {
    stopReason: "toolUse",
  });
  upstream.push({
    type: "toolcall_end",
    contentIndex: 0,
    toolCall: fauxToolCall("browser", {}),
    partial: message,
  });
  upstream.push({ type: "done", reason: "toolUse", message });
  const provider = withBufferedToolAdmission(
    { ...faux.provider, streamSimple: () => upstream },
    () => true,
    new Set(["browser"]),
  );
  await expect(
    collect(provider.streamSimple(model, { messages: [] })),
  ).rejects.toThrow("Mixed browser/server proposal");
});

test("bounds event count even when individual chunks are tiny", async () => {
  const { faux, model } = fixture();
  const upstream = createAssistantMessageEventStream();
  const message = fauxAssistantMessage([fauxText("tiny")]);
  for (let index = 0; index <= admissionBufferLimits.events; index++)
    upstream.push({
      type: "text_delta",
      contentIndex: 0,
      delta: "",
      partial: message,
    });
  upstream.push({ type: "done", reason: "stop", message });
  const provider = withBufferedToolAdmission(
    { ...faux.provider, streamSimple: () => upstream },
    () => true,
    new Set(["browser"]),
  );
  await expect(
    collect(provider.streamSimple(model, { messages: [] })),
  ).rejects.toThrow("buffering limit");
});

test("bounds silence without a retryable timeout message", async () => {
  vi.useFakeTimers();
  try {
    const { faux, model } = fixture();
    const provider = withBufferedToolAdmission(
      {
        ...faux.provider,
        streamSimple() {
          return createAssistantMessageEventStream();
        },
      },
      () => true,
      new Set(["browser"]),
    );
    const assertion = expect(
      collect(provider.streamSimple(model, { messages: [] })),
    ).rejects.toThrow("buffering limit");
    await vi.advanceTimersByTimeAsync(admissionBufferLimits.milliseconds);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});
