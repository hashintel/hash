import {
  CLIENT_TOOL_RESULT_SIGNAL,
  parseClientToolResults,
  type ClientToolResult,
} from "./client-tool-result";

import type { FlueConversationMessage, FlueConversationPart } from "@flue/sdk";

type DynamicToolPart = Extract<FlueConversationPart, { type: "dynamic-tool" }>;

export type ClientToolHistoryCall = Pick<
  DynamicToolPart,
  "toolCallId" | "toolName"
> & { readonly input: Readonly<Record<string, unknown>> };

/** Provenance is not part of history correlation; only identity, output and sidecar are. */
export type ClientToolHistoryResult = Pick<
  ClientToolResult,
  "output" | "metadata" | "toolCallId" | "toolName"
>;

export interface ClientToolHistory {
  readonly calls: readonly ClientToolHistoryCall[];
  readonly results: readonly ClientToolHistoryResult[];
}

export type ClientToolHistoryMessage = Pick<
  FlueConversationMessage,
  "parts" | "signal"
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const callsFrom = (
  messages: readonly ClientToolHistoryMessage[],
): readonly ClientToolHistoryCall[] =>
  messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type !== "dynamic-tool" || !isRecord(part.input)) {
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
    if (message.signal?.tagName !== CLIENT_TOOL_RESULT_SIGNAL) {
      return message.parts.flatMap((part): ClientToolHistoryResult[] => {
        if (
          part.type !== "dynamic-tool" ||
          part.state !== "output-available" ||
          !isRecord(part.output) ||
          part.output.brunchBrowserResult !== true ||
          !("output" in part.output)
        )
          return [];
        return [
          {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: part.output.output,
            ...("metadata" in part.output
              ? { metadata: part.output.metadata }
              : {}),
          },
        ];
      });
    }
    const body = message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
    return parseClientToolResults(body).map(
      ({ output, metadata, toolCallId, toolName }) =>
        metadata === undefined
          ? { output, toolCallId, toolName }
          : { output, metadata, toolCallId, toolName },
    );
  });

export const clientToolHistoryFrom = (
  messages: readonly ClientToolHistoryMessage[],
): ClientToolHistory => ({
  calls: callsFrom(messages),
  results: resultsFrom(messages),
});
