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
  claimModelStreamIdleRetry,
  modelAdmissionScope,
  modelStreamIdleTimeoutDefaults,
  withBufferedToolAdmission,
} from "../src/provider-admission";

const collect = async (stream: ReturnType<Provider["streamSimple"]>) => {
  const events = [];
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result() };
};
test("production idle policy tolerates long reasoning silence while remaining bounded", () => {
  expect(modelStreamIdleTimeoutDefaults).toEqual({
    cancellationTimeoutMs: 2_000,
    firstEventTimeoutMs: 60_000,
    idleTimeoutMs: 120_000,
    reasoningStartTimeoutMs: 120_000,
  });
});

test("an idle retry scope can be claimed only once", () => {
  const scope = { idleRetryAvailable: true };
  expect(claimModelStreamIdleRetry(scope)).toBe(true);
  expect(claimModelStreamIdleRetry(scope)).toBe(false);
});

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
  "%s rejects a complete mixed proposal without publishing executable calls",
  async (method) => {
    const { faux, provider, model } = fixture();
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxText("Visible progress is not tool admission."),
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
    expect(events.some((event) => event.type === "text_delta")).toBe(true);
    expect(
      events.filter(
        (event) => event.type === "toolcall_end" || event.type === "done",
      ),
    ).toEqual([]);
    await expect(stream.result()).rejects.toThrow(
      "Mixed browser/server proposal",
    );
  },
);

test.each(["stream", "streamSimple"] as const)(
  "%s admits a complete browser-only proposal containing multiple calls",
  async (method) => {
    const { faux, provider, model } = fixture();
    const message = fauxAssistantMessage(
      [
        fauxToolCall("browser", { sequence: 1 }, { id: "first" }),
        fauxToolCall("browser", { sequence: 2 }, { id: "second" }),
      ],
      { stopReason: "toolUse" },
    );
    faux.setResponses([message]);

    const { events, result } = await collect(
      provider[method](model, { messages: [] }),
    );

    expect(result.content).toEqual(message.content);
    expect(result.stopReason).toBe("toolUse");
    expect(
      events.filter((event) => event.type === "toolcall_end"),
    ).toHaveLength(2);
    expect(events.at(-1)?.type).toBe("done");
  },
);

test.each(["final", "streamed"] as const)(
  "refuses duplicate browser IDs in the %s representation before publication",
  async (duplicateRepresentation) => {
    const { faux, model } = fixture();
    const first = fauxToolCall("browser", { sequence: 1 }, { id: "duplicate" });
    const second = fauxToolCall(
      "browser",
      { sequence: 2 },
      {
        id:
          duplicateRepresentation === "final" ? "duplicate" : "distinct-final",
      },
    );
    const message = fauxAssistantMessage([first, second], {
      stopReason: "toolUse",
    });
    const upstream = createAssistantMessageEventStream();
    upstream.push({
      type: "toolcall_end",
      contentIndex: 0,
      toolCall: first,
      partial: message,
    });
    if (duplicateRepresentation === "streamed") {
      upstream.push({
        type: "toolcall_end",
        contentIndex: 1,
        toolCall: fauxToolCall("browser", { sequence: 2 }, { id: "duplicate" }),
        partial: message,
      });
    }
    upstream.push({ type: "done", reason: "toolUse", message });
    const provider = withBufferedToolAdmission(
      { ...faux.provider, streamSimple: () => upstream },
      () => true,
      new Set(["browser"]),
    );
    const events: AssistantMessageEvent[] = [];
    const stream = provider.streamSimple(model, { messages: [] });

    await expect(
      (async () => {
        for await (const event of stream) events.push(event);
      })(),
    ).rejects.toThrow("Duplicate browser tool-call IDs");
    expect(
      events.filter(
        (event) => event.type === "toolcall_end" || event.type === "done",
      ),
    ).toEqual([]);
    await expect(stream.result()).rejects.toThrow(
      "Duplicate browser tool-call IDs",
    );
  },
);

test.each(["stream", "streamSimple"] as const)(
  "%s streams progress before completion but holds executable inputs until admission",
  async (method) => {
    const { faux, model } = fixture();
    const upstream = createAssistantMessageEventStream();
    const provider = withBufferedToolAdmission(
      { ...faux.provider, [method]: () => upstream },
      () => true,
      new Set(["browser"]),
    );
    const abort = new AbortController();
    const stream = provider[method](
      model,
      { messages: [] },
      { signal: abort.signal },
    );
    const published: AssistantMessageEvent[] = [];
    const reading = (async () => {
      for await (const event of stream) published.push(event);
      return stream.result();
    })();
    void reading.catch(() => {});
    const toolCall = fauxToolCall("browser", { value: "é" }, { id: "held" });
    const message = fauxAssistantMessage(
      [
        {
          type: "thinking",
          thinking: "Considering the model.",
          thinkingSignature: "preserved",
        },
        fauxText("Preparing a change."),
        toolCall,
      ],
      { stopReason: "toolUse" },
    );
    const progress: AssistantMessageEvent[] = [
      { type: "start", partial: message },
      { type: "thinking_start", contentIndex: 0, partial: message },
      {
        type: "thinking_delta",
        contentIndex: 0,
        delta: "Considering the model.",
        partial: message,
      },
      {
        type: "thinking_end",
        contentIndex: 0,
        content: "Considering the model.",
        partial: message,
      },
      { type: "text_start", contentIndex: 1, partial: message },
      {
        type: "text_delta",
        contentIndex: 1,
        delta: "Preparing a change.",
        partial: message,
      },
      {
        type: "text_end",
        contentIndex: 1,
        content: "Preparing a change.",
        partial: message,
      },
      { type: "toolcall_start", contentIndex: 2, partial: message },
      {
        type: "toolcall_delta",
        contentIndex: 2,
        delta: '{"value":"é"}',
        partial: message,
      },
    ];
    try {
      for (const event of progress) upstream.push(event);
      upstream.push({
        type: "toolcall_end",
        contentIndex: 2,
        toolCall,
        partial: message,
      });
      await expect.poll(() => published.length).toBe(progress.length);
      expect(published).toEqual(progress);
      upstream.push({ type: "done", reason: "toolUse", message });
      expect(await reading).toEqual(message);
      expect(
        published.slice(progress.length).map((event) => event.type),
      ).toEqual(["toolcall_end", "done"]);
    } finally {
      abort.abort();
      await reading.catch(() => {});
    }
  },
);

test("gives newly opened reasoning its longer first-delta grace", async () => {
  vi.useFakeTimers();
  try {
    const { faux, model } = fixture();
    const upstream = createAssistantMessageEventStream();
    let upstreamSignal: AbortSignal | undefined;
    const provider = withBufferedToolAdmission(
      {
        ...faux.provider,
        streamSimple(_model, _context, options) {
          upstreamSignal = options?.signal;
          options?.signal?.addEventListener(
            "abort",
            () => {
              upstream.push({
                error: fauxAssistantMessage([], { stopReason: "aborted" }),
                reason: "aborted",
                type: "error",
              });
            },
            { once: true },
          );
          return upstream;
        },
      },
      () => true,
      new Set(["browser"]),
      {
        cancellationTimeoutMs: 5,
        claimRetry: () => false,
        firstEventTimeoutMs: 100,
        idleTimeoutMs: 10,
        reasoningStartTimeoutMs: 15,
      },
    );
    const message = fauxAssistantMessage([
      { type: "thinking", thinking: "", thinkingSignature: "synthetic" },
    ]);
    const reading = collect(provider.streamSimple(model, { messages: [] }));
    void reading.catch(() => {});
    upstream.push({ partial: message, type: "start" });
    upstream.push({
      contentIndex: 0,
      partial: message,
      type: "thinking_start",
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(upstreamSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5);
    await expect(reading).rejects.toMatchObject({
      code: "model_stream_idle",
      idleMs: 15,
      lastEventType: "thinking_start",
      phase: "reasoning_start",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("active reasoning continues below its configured threshold and retries once above it", async () => {
  vi.useFakeTimers();
  try {
    const { faux, model } = fixture();
    const upstream = createAssistantMessageEventStream();
    let upstreamSignal: AbortSignal | undefined;
    const retryScope = { idleRetryAvailable: true };
    const claimRetry = vi.fn<() => boolean>(() =>
      claimModelStreamIdleRetry(retryScope),
    );
    const provider = withBufferedToolAdmission(
      {
        ...faux.provider,
        streamSimple(_model, _context, options) {
          upstreamSignal = options?.signal;
          options?.signal?.addEventListener(
            "abort",
            () => {
              upstream.push({
                error: fauxAssistantMessage([], { stopReason: "aborted" }),
                reason: "aborted",
                type: "error",
              });
            },
            { once: true },
          );
          return upstream;
        },
      },
      () => true,
      new Set(["browser"]),
      {
        cancellationTimeoutMs: 5,
        claimRetry,
        firstEventTimeoutMs: 100,
        idleTimeoutMs: 10,
        reasoningStartTimeoutMs: 15,
      },
    );
    const message = fauxAssistantMessage([
      {
        type: "thinking",
        thinking: "Reasoning began.",
        thinkingSignature: "synthetic",
      },
    ]);
    const reading = collect(provider.streamSimple(model, { messages: [] }));
    void reading.catch(() => {});
    upstream.push({ partial: message, type: "start" });
    upstream.push({
      contentIndex: 0,
      partial: message,
      type: "thinking_start",
    });
    upstream.push({
      contentIndex: 0,
      delta: "Reasoning began.",
      partial: message,
      type: "thinking_delta",
    });

    await vi.advanceTimersByTimeAsync(9);
    expect(upstreamSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error: unknown = await reading.catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      code: "model_stream_idle",
      idleMs: 10,
      lastEventType: "thinking_delta",
      phase: "active_reasoning",
    });
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected idle failure.");
    expect(error.message).toContain("retryable_interruption");
    expect(claimRetry).toHaveBeenCalledOnce();
    expect(retryScope.idleRetryAvailable).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test("stops without claiming a retry when idle cancellation is not acknowledged", async () => {
  vi.useFakeTimers();
  try {
    const { faux, model } = fixture();
    const upstream = createAssistantMessageEventStream();
    let upstreamSignal: AbortSignal | undefined;
    const claimRetry = vi.fn<() => boolean>(() => true);
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
      {
        cancellationTimeoutMs: 5,
        claimRetry,
        firstEventTimeoutMs: 100,
        idleTimeoutMs: 10,
        reasoningStartTimeoutMs: 15,
      },
    );
    const toolCall = fauxToolCall("browser", {}, { id: "unacknowledged" });
    const message = fauxAssistantMessage([toolCall], {
      stopReason: "toolUse",
    });
    const stream = provider.streamSimple(model, { messages: [] });
    const reading = collect(stream);
    void reading.catch(() => {});
    upstream.push({ partial: message, type: "start" });
    upstream.push({
      contentIndex: 0,
      partial: message,
      type: "toolcall_start",
    });
    upstream.push({
      contentIndex: 0,
      delta: "{",
      partial: message,
      type: "toolcall_delta",
    });
    await vi.advanceTimersByTimeAsync(15);
    expect(upstreamSignal?.aborted).toBe(true);
    expect(claimRetry).not.toHaveBeenCalled();
    await expect(reading).rejects.toMatchObject({
      code: "model_stream_cancellation_unacknowledged",
    });

    upstream.push({
      contentIndex: 0,
      partial: message,
      toolCall,
      type: "toolcall_end",
    });
    upstream.push({ message, reason: "toolUse", type: "done" });
    await expect(stream.result()).rejects.toMatchObject({
      code: "model_stream_cancellation_unacknowledged",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("admits a completed call that wins the idle race", async () => {
  vi.useFakeTimers();
  try {
    const { faux, model } = fixture();
    const upstream = createAssistantMessageEventStream();
    const claimRetry = vi.fn<() => boolean>(() => true);
    const provider = withBufferedToolAdmission(
      { ...faux.provider, streamSimple: () => upstream },
      () => true,
      new Set(["browser"]),
      {
        cancellationTimeoutMs: 5,
        claimRetry,
        firstEventTimeoutMs: 100,
        idleTimeoutMs: 10,
        reasoningStartTimeoutMs: 15,
      },
    );
    const toolCall = fauxToolCall("browser", {}, { id: "admitted" });
    const message = fauxAssistantMessage([toolCall], {
      stopReason: "toolUse",
    });
    const reading = collect(provider.streamSimple(model, { messages: [] }));
    upstream.push({ partial: message, type: "start" });
    upstream.push({
      contentIndex: 0,
      partial: message,
      type: "toolcall_start",
    });
    upstream.push({
      contentIndex: 0,
      delta: "{",
      partial: message,
      type: "toolcall_delta",
    });
    await vi.advanceTimersByTimeAsync(9);
    upstream.push({
      contentIndex: 0,
      partial: message,
      toolCall,
      type: "toolcall_end",
    });
    upstream.push({ message, reason: "toolUse", type: "done" });

    expect((await reading).result).toEqual(message);
    expect(claimRetry).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("does not retry after a complete tool call wins the idle race", async () => {
  vi.useFakeTimers();
  try {
    const { faux, model } = fixture();
    const upstream = createAssistantMessageEventStream();
    const claimRetry = vi.fn<() => boolean>(() => true);
    const provider = withBufferedToolAdmission(
      {
        ...faux.provider,
        streamSimple(_model, _context, options) {
          options?.signal?.addEventListener(
            "abort",
            () => {
              upstream.push({
                error: fauxAssistantMessage([], { stopReason: "aborted" }),
                reason: "aborted",
                type: "error",
              });
            },
            { once: true },
          );
          return upstream;
        },
      },
      () => true,
      new Set(["browser"]),
      {
        cancellationTimeoutMs: 5,
        claimRetry,
        firstEventTimeoutMs: 100,
        idleTimeoutMs: 10,
        reasoningStartTimeoutMs: 15,
      },
    );
    const toolCall = fauxToolCall("browser", {}, { id: "completed-call" });
    const message = fauxAssistantMessage([toolCall], {
      stopReason: "toolUse",
    });
    const reading = collect(provider.streamSimple(model, { messages: [] }));
    void reading.catch(() => {});
    upstream.push({ partial: message, type: "start" });
    upstream.push({
      contentIndex: 0,
      partial: message,
      type: "toolcall_start",
    });
    upstream.push({
      contentIndex: 0,
      delta: "{}",
      partial: message,
      type: "toolcall_delta",
    });
    upstream.push({
      contentIndex: 0,
      partial: message,
      toolCall,
      type: "toolcall_end",
    });
    await vi.advanceTimersByTimeAsync(10);

    await expect(reading).rejects.toMatchObject({
      code: "model_stream_idle",
    });
    expect(claimRetry).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test.each(["missing", "arguments", "identity"] as const)(
  "refuses inconsistent streamed and final browser calls (%s)",
  async (difference) => {
    const { faux, model } = fixture();
    const streamed = fauxToolCall("browser", { value: 1 }, { id: "published" });
    const final = fauxToolCall(
      "browser",
      { value: difference === "arguments" ? 2 : 1 },
      { id: difference === "identity" ? "other" : "published" },
    );
    const message = fauxAssistantMessage(
      difference === "missing" ? [] : [final],
      {
        stopReason: "toolUse",
      },
    );
    const upstream = createAssistantMessageEventStream();
    upstream.push({
      type: "toolcall_end",
      contentIndex: 0,
      toolCall: streamed,
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
    ).rejects.toThrow(/browser.*proposal/iu);
  },
);

test("preserves one browser call across key-order-equivalent stream and final representations", async () => {
  const { faux, model } = fixture();
  const message = fauxAssistantMessage(
    [fauxToolCall("browser", { second: 2, first: 1 }, { id: "only" })],
    { stopReason: "toolUse" },
  );
  const upstream = createAssistantMessageEventStream();
  upstream.push({
    type: "toolcall_end",
    contentIndex: 0,
    toolCall: fauxToolCall("browser", { first: 1, second: 2 }, { id: "only" }),
    partial: message,
  });
  upstream.push({ type: "done", reason: "toolUse", message });
  const provider = withBufferedToolAdmission(
    { ...faux.provider, streamSimple: () => upstream },
    () => true,
    new Set(["browser"]),
  );
  expect(
    (await collect(provider.streamSimple(model, { messages: [] }))).result,
  ).toEqual(message);
});

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

test("async browser mode admits allowlisted mixes but refuses a call beside the result it reads", async () => {
  const faux = fauxProvider({
    provider: "anthropic",
    models: [{ id: "synthetic", reasoning: true }],
  });
  const provider = withBufferedToolAdmission(
    faux.provider,
    () => true,
    new Set(["read", "write"]),
    {
      ...modelStreamIdleTimeoutDefaults,
      claimRetry: () => false,
      mixedToolNames: new Set(["read", "write", "query"]),
      dependentToolNames: new Map([["query", ["read"]]]),
    },
  );
  const model = provider.getModels()[0]!;
  const proposal = (...names: string[]) =>
    fauxAssistantMessage(
      names.map((name) => fauxToolCall(name, {}, { id: name })),
      { stopReason: "toolUse" },
    );
  faux.setResponses([proposal("write", "query"), proposal("read", "query")]);
  const inScope = () =>
    modelAdmissionScope.run(
      { idleRetryAvailable: false, asyncBrowserTools: true },
      () => collect(provider.streamSimple(model, { messages: [] })),
    );

  expect((await inScope()).result.stopReason).toBe("toolUse");
  await expect(inScope()).rejects.toThrow(
    "Dependent proposal refused before admission: query reads the result of read.",
  );
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

for (const method of ["stream", "streamSimple"] as const) {
  test.each(["complete", "cancel"] as const)(
    `${method} can %s after waiting beyond the former two-minute deadline`,
    async (ending) => {
      vi.useFakeTimers();
      try {
        const { faux, model } = fixture();
        const upstream = createAssistantMessageEventStream();
        let upstreamSignal: AbortSignal | undefined;
        const start: Provider["streamSimple"] = (_model, _context, options) => {
          upstreamSignal = options?.signal;
          return upstream;
        };
        const provider = withBufferedToolAdmission(
          { ...faux.provider, [method]: start },
          () => true,
          new Set(["browser"]),
        );
        const abort = new AbortController();
        const stream = provider[method](
          model,
          { messages: [] },
          { signal: abort.signal },
        );
        const published: AssistantMessageEvent[] = [];
        const reading = (async () => {
          for await (const event of stream) published.push(event);
          return stream.result();
        })();
        const outcome = reading.then(
          (result) => result,
          (error: unknown) => error,
        );
        await vi.advanceTimersByTimeAsync(180_000);
        expect(upstreamSignal?.aborted).toBe(false);
        expect(published).toEqual([]);
        const call = fauxToolCall("browser", {}, { id: "delayed-call" });
        const message = fauxAssistantMessage([call], {
          stopReason: "toolUse",
        });
        if (ending === "cancel") {
          abort.abort();
        } else {
          upstream.push({
            type: "toolcall_end",
            contentIndex: 0,
            toolCall: call,
            partial: message,
          });
          upstream.push({ type: "done", reason: "toolUse", message });
        }
        const expected =
          ending === "cancel"
            ? new DOMException(
                "Brunch response cancelled before admission.",
                "AbortError",
              )
            : message;
        expect(await outcome).toEqual(expected);
        expect(upstreamSignal?.aborted).toBe(ending === "cancel");
        expect(published.map((event) => event.type)).toEqual(
          ending === "cancel" ? [] : ["toolcall_end", "done"],
        );
        await expect(
          stream.result().catch((error: unknown) => error),
        ).resolves.toEqual(expected);
      } finally {
        vi.useRealTimers();
      }
    },
  );
}

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
