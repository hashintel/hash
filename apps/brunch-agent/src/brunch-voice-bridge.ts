type BrunchVoiceBridgeDependencies = {
  chatEndpoint: string;
  createId?: () => string;
  fetch?: typeof globalThis.fetch;
};

type VoiceTurn = {
  conversationId: string;
  signal: AbortSignal;
  transcript: string;
};

type PendingAsk = {
  assistantMessageId: string;
  input: unknown;
  toolCallId: string;
};

type BridgeSessionState = {
  pendingAsk?: PendingAsk;
};

type UiStreamChunk = Record<string, unknown> & { type: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const stringProperty = (
  value: Record<string, unknown> | null,
  key: string,
): string | null => {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
};

const chunksFromFrame = (frame: string): UiStreamChunk[] => {
  const data = frame
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") {
    return [];
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    const record = asRecord(parsed);
    return record && typeof record.type === "string"
      ? [record as UiStreamChunk]
      : [];
  } catch {
    throw new Error("Brunch returned an invalid voice response.");
  }
};

const readUiMessageStream = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<UiStreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        yield* chunksFromFrame(frame);
      }

      if (done) {
        break;
      }
    }

    if (buffer.trim()) {
      yield* chunksFromFrame(buffer);
    }
  } finally {
    reader.releaseLock();
  }
};

/**
 * Translates finalized Speech Engine turns into the existing AI SDK transport.
 * Brunch remains authoritative: this bridge retains only enough correlation to
 * return a spoken answer to a pending `brunch_ask` affordance.
 */
export class BrunchVoiceBridge {
  readonly #chatEndpoint: string;
  readonly #createId: () => string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #sessions = new Map<string, BridgeSessionState>();

  public constructor(dependencies: BrunchVoiceBridgeDependencies) {
    this.#chatEndpoint = dependencies.chatEndpoint;
    this.#createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.#fetch = dependencies.fetch ?? globalThis.fetch;
  }

  public async *respond({
    conversationId,
    signal,
    transcript,
  }: VoiceTurn): AsyncGenerator<string> {
    const normalizedTranscript = transcript.trim();
    if (!normalizedTranscript) {
      return;
    }

    const state = this.#sessions.get(conversationId) ?? {};
    this.#sessions.set(conversationId, state);
    const pendingAsk = state.pendingAsk;
    // The answer is consumed when dispatched. A barge-in must not replay that
    // same affordance after its previous response stream is cancelled.
    state.pendingAsk = undefined;

    const brunchConversationId = `voice:${conversationId}`;
    const body = pendingAsk
      ? {
          id: brunchConversationId,
          trigger: "submit-message",
          messageId: pendingAsk.assistantMessageId,
          messages: [
            {
              id: pendingAsk.assistantMessageId,
              role: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolName: "brunch_ask",
                  toolCallId: pendingAsk.toolCallId,
                  state: "output-available",
                  input: pendingAsk.input,
                  output: { answer: normalizedTranscript },
                },
              ],
            },
          ],
        }
      : {
          id: brunchConversationId,
          trigger: "submit-message",
          messages: [
            {
              id: this.#createId(),
              role: "user",
              parts: [{ type: "text", text: normalizedTranscript }],
            },
          ],
        };

    const response = await this.#fetch(this.#chatEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": this.#createId(),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error("Brunch could not answer the voice turn.");
    }

    let assistantMessageId: string | null =
      pendingAsk?.assistantMessageId ?? null;
    for await (const chunk of readUiMessageStream(response.body)) {
      if (chunk.type === "start") {
        assistantMessageId = stringProperty(chunk, "messageId");
        continue;
      }

      if (chunk.type === "text-delta") {
        const delta = stringProperty(chunk, "delta");
        if (delta) {
          yield delta;
        }
        continue;
      }

      if (
        chunk.type === "tool-input-available" &&
        stringProperty(chunk, "toolName") === "brunch_ask"
      ) {
        const toolCallId = stringProperty(chunk, "toolCallId");
        const input = chunk.input;
        if (!assistantMessageId || !toolCallId) {
          throw new Error("Brunch returned an invalid voice response.");
        }
        state.pendingAsk = { assistantMessageId, input, toolCallId };

        const question = stringProperty(asRecord(input), "question");
        if (question) {
          yield question;
        }
        continue;
      }

      if (chunk.type === "error") {
        throw new Error("Brunch could not answer the voice turn.");
      }
    }
  }

  public release(conversationId: string): void {
    this.#sessions.delete(conversationId);
  }
}
