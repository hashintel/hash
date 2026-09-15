export type LiveToolStreamEvent =
  | LiveToolCallStreamEvent<"tool-input-start">
  | (LiveToolCallStreamEvent<"tool-input-delta"> & {
      readonly inputTextDelta: string;
    })
  | (LiveToolStreamCorrelation & {
      readonly kind: "turn-finished";
    })
  | (Omit<LiveToolStreamCorrelation, "turnId"> & {
      readonly kind: "submission-finished";
      readonly outcome: "aborted" | "completed" | "failed";
    });

type LiveToolStreamCorrelation = {
  readonly instanceId: string;
  readonly sequence: number;
  readonly submissionId: string;
  readonly turnId: string;
  readonly v: 1;
};

type LiveToolCallStreamEvent<Kind extends string> =
  LiveToolStreamCorrelation & {
    readonly kind: Kind;
    readonly toolCallId: string;
    readonly toolName: string;
  };

type RequestHeaders =
  | Record<string, string>
  | (() => Promise<Record<string, string>> | Record<string, string>);

export type LiveToolStreamOptions = {
  readonly fetch?: typeof globalThis.fetch;
  readonly headers: RequestHeaders;
  readonly onError?: (error: unknown) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const parseLiveToolStreamEvent = (value: unknown): LiveToolStreamEvent => {
  if (
    !isRecord(value) ||
    value.v !== 1 ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 0
  ) {
    throw new Error("The live tool stream delivered an invalid event.");
  }
  const instanceId = nonEmptyString(value, "instanceId");
  const submissionId = nonEmptyString(value, "submissionId");
  const kind = nonEmptyString(value, "kind");
  if (instanceId === undefined || submissionId === undefined) {
    throw new Error("The live tool stream event is missing its correlation.");
  }
  const base = {
    instanceId,
    sequence: value.sequence as number,
    submissionId,
    v: 1 as const,
  };

  if (kind === "submission-finished") {
    const outcome = value.outcome;
    if (
      outcome !== "aborted" &&
      outcome !== "completed" &&
      outcome !== "failed"
    ) {
      throw new Error("The live tool stream terminal outcome is invalid.");
    }
    return { ...base, kind, outcome };
  }

  const turnId = nonEmptyString(value, "turnId");
  if (turnId === undefined) {
    throw new Error("The live tool stream event is missing its turn.");
  }
  if (kind === "turn-finished") return { ...base, kind, turnId };

  const toolCallId = nonEmptyString(value, "toolCallId");
  const toolName = nonEmptyString(value, "toolName");
  if (toolCallId === undefined || toolName === undefined) {
    throw new Error("The live tool stream event is missing its tool call.");
  }
  if (kind === "tool-input-start") {
    return { ...base, kind, toolCallId, toolName, turnId };
  }
  if (kind === "tool-input-delta" && typeof value.inputTextDelta === "string") {
    return {
      ...base,
      kind,
      inputTextDelta: value.inputTextDelta,
      toolCallId,
      toolName,
      turnId,
    };
  }
  throw new Error("The live tool stream event kind is invalid.");
};

const dataFromFrame = (frame: string): string | undefined => {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  return data.length === 0 ? undefined : data.join("\n");
};

export const readLiveToolStream = async (input: {
  readonly conversationUrl: string;
  readonly onEvent: (event: LiveToolStreamEvent) => void;
  readonly options: LiveToolStreamOptions;
  readonly signal: AbortSignal;
  readonly submissionId: string;
}): Promise<void> => {
  const url = new URL(`${input.conversationUrl.replace(/\/+$/u, "")}/live`);
  url.searchParams.set("submissionId", input.submissionId);
  const headers =
    typeof input.options.headers === "function"
      ? await input.options.headers()
      : input.options.headers;
  const fetchImplementation =
    input.options.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImplementation(url, {
    headers: { accept: "text/event-stream", ...headers },
    signal: input.signal,
  });
  if (!response.ok || response.body === null) {
    throw new Error(
      `The live tool stream request failed with HTTP ${response.status}.`,
    );
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffered = "";
  for (;;) {
    // The SSE body is sequential by definition.
    // eslint-disable-next-line no-await-in-loop
    const chunk = await reader.read();
    if (chunk.done) break;
    buffered = (
      buffered + decoder.decode(chunk.value, { stream: true })
    ).replaceAll("\r\n", "\n");
    let frameBoundary = buffered.indexOf("\n\n");
    while (frameBoundary >= 0) {
      const frame = buffered.slice(0, frameBoundary);
      buffered = buffered.slice(frameBoundary + 2);
      const data = dataFromFrame(frame);
      if (data !== undefined) {
        input.onEvent(parseLiveToolStreamEvent(JSON.parse(data)));
      }
      frameBoundary = buffered.indexOf("\n\n");
    }
    if (buffered.length > 65_536) {
      throw new Error("The live tool stream frame exceeded 64 KiB.");
    }
  }
};
