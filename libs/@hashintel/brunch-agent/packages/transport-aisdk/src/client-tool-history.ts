import { CLIENT_TOOL_RESULT_SIGNAL } from "./client-tool-result";

export interface ClientToolHistoryCall {
  readonly input: Readonly<Record<string, unknown>>;
  readonly toolCallId: string;
  readonly toolName: string;
}

export interface ClientToolHistoryResult {
  readonly output: unknown;
  readonly toolCallId: string;
  readonly toolName: string;
}

export interface ClientToolHistory {
  readonly calls: readonly ClientToolHistoryCall[];
  readonly results: readonly ClientToolHistoryResult[];
}

export interface ClientToolHistoryMessage {
  readonly parts: readonly unknown[];
  readonly signal?: {
    readonly tagName?: string;
    readonly type?: string;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const callsFrom = (
  messages: readonly ClientToolHistoryMessage[],
): readonly ClientToolHistoryCall[] =>
  messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (
        !isRecord(part) ||
        part.type !== "dynamic-tool" ||
        typeof part.toolName !== "string" ||
        typeof part.toolCallId !== "string" ||
        !isRecord(part.input)
      ) {
        return [];
      }
      return [
        {
          input: part.input,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
        },
      ];
    }),
  );

const resultsFrom = (
  messages: readonly ClientToolHistoryMessage[],
): readonly ClientToolHistoryResult[] =>
  messages.flatMap((message) => {
    if (
      message.signal?.tagName !== CLIENT_TOOL_RESULT_SIGNAL &&
      message.signal?.type !== CLIENT_TOOL_RESULT_SIGNAL
    ) {
      return [];
    }

    const body = message.parts
      .flatMap((part) =>
        isRecord(part) && part.type === "text" && typeof part.text === "string"
          ? [part.text]
          : [],
      )
      .join("");

    try {
      const parsed: unknown = JSON.parse(body);
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((result) => {
        if (
          !isRecord(result) ||
          typeof result.toolName !== "string" ||
          typeof result.toolCallId !== "string" ||
          !("output" in result)
        ) {
          return [];
        }
        return [
          {
            output: result.output,
            toolCallId: result.toolCallId,
            toolName: result.toolName,
          },
        ];
      });
    } catch {
      return [];
    }
  });

export const clientToolHistoryFrom = (
  messages: readonly ClientToolHistoryMessage[],
): ClientToolHistory => ({
  calls: callsFrom(messages),
  results: resultsFrom(messages),
});
