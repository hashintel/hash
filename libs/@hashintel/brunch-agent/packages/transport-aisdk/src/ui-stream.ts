import { serializeErrorText } from "./error-text";

import type { AgentSendResult, ConversationStreamChunk } from "@flue/sdk";
import type { UIMessageChunk } from "ai";

export interface FlueUiStreamOptions {
  readonly submissionId: AgentSendResult["submissionId"];
  readonly clientToolNames: ReadonlySet<string>;
  readonly hiddenToolNames?: ReadonlySet<string>;
  readonly mapClientToolInput?: (input: {
    readonly input: unknown;
    readonly toolName: string;
  }) => unknown;
  readonly write: (chunk: UIMessageChunk) => void;
}

type StreamingPart = {
  readonly kind: "text" | "reasoning";
  readonly partId: string;
};

type ToolInputChunk = Extract<
  ConversationStreamChunk,
  { readonly type: "tool-input" }
>;

const unhandledConversationChunk = (chunk: never): never => {
  throw new Error(
    `Unhandled Flue conversation chunk: ${JSON.stringify(chunk)}`,
  );
};

export const createFlueUiStream = (
  options: FlueUiStreamOptions,
): { accept: (chunk: ConversationStreamChunk) => void } => {
  let accepting = false;
  let messageId: string | undefined;
  let turnId: string | undefined;
  let partOrdinal = 0;
  let streamingPart: StreamingPart | undefined;
  const hiddenToolCallIds = new Set<string>();
  const pendingClientToolInputs = new Map<string, ToolInputChunk>();
  const authorizedClientToolCallIds = new Set<string>();

  const mappedClientToolInput = (chunk: ToolInputChunk): unknown =>
    options.mapClientToolInput === undefined
      ? chunk.input
      : options.mapClientToolInput({
          input: chunk.input,
          toolName: chunk.toolName,
        });

  const finishPart = (): void => {
    if (!streamingPart) return;
    options.write({
      type: `${streamingPart.kind}-end`,
      id: streamingPart.partId,
    });
    streamingPart = undefined;
  };

  const finishTurn = (): void => {
    finishPart();
    if (!turnId) return;
    options.write({ type: "finish-step" });
    turnId = undefined;
  };

  const startPart = (kind: StreamingPart["kind"]): StreamingPart => {
    finishPart();
    partOrdinal += 1;
    const part = {
      kind,
      partId: `${messageId}:${kind}:${partOrdinal}`,
    } as const;
    options.write({ type: `${kind}-start`, id: part.partId });
    streamingPart = part;
    return part;
  };

  return {
    accept(chunk) {
      switch (chunk.type) {
        case "message-started": {
          accepting = chunk.submissionId === options.submissionId;
          if (!accepting) return;

          if (messageId === undefined) {
            messageId = chunk.messageId;
            options.write({ type: "start", messageId });
          }
          finishTurn();
          turnId = chunk.turnId ?? `${messageId}:turn`;
          options.write({ type: "start-step" });
          return;
        }
        case "submission-settled": {
          if (chunk.submissionId !== options.submissionId) return;
          finishTurn();
          switch (chunk.outcome) {
            case "completed":
              options.write({
                type: "finish",
                finishReason:
                  authorizedClientToolCallIds.size > 0 ? "tool-calls" : "stop",
              });
              break;
            case "failed":
              options.write({
                type: "error",
                errorText: serializeErrorText(chunk.error),
              });
              break;
            case "aborted":
              options.write({
                type: "abort",
                reason: "The chat turn aborted.",
              });
              break;
            default:
              unhandledConversationChunk(chunk.outcome);
          }
          accepting = false;
          return;
        }
        case "conversation-reset":
        case "message-appended":
        case "stream-checkpoint":
          return;
        case "message-delta": {
          if (!accepting || messageId === undefined) return;
          if (chunk.messageId !== messageId) return;
          const part =
            streamingPart?.kind === chunk.kind
              ? streamingPart
              : startPart(chunk.kind);
          options.write({
            type: `${part.kind}-delta`,
            id: part.partId,
            delta: chunk.delta,
          });
          return;
        }
        case "tool-input": {
          if (!accepting || messageId === undefined) return;
          if (chunk.messageId !== messageId) return;
          finishPart();
          if (options.hiddenToolNames?.has(chunk.toolName) === true) {
            hiddenToolCallIds.add(chunk.toolCallId);
            return;
          }
          const isClientTool = options.clientToolNames.has(chunk.toolName);
          if (isClientTool) {
            pendingClientToolInputs.set(chunk.toolCallId, chunk);
            return;
          }
          options.write({
            type: "tool-input-available",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input,
            providerExecuted: true,
          });
          return;
        }
        case "tool-output": {
          if (!accepting || messageId === undefined) return;
          if (hiddenToolCallIds.has(chunk.toolCallId)) return;
          const pendingClientToolInput = pendingClientToolInputs.get(
            chunk.toolCallId,
          );
          if (pendingClientToolInput !== undefined) {
            pendingClientToolInputs.delete(chunk.toolCallId);
            authorizedClientToolCallIds.add(chunk.toolCallId);
            options.write({
              type: "tool-input-available",
              toolCallId: pendingClientToolInput.toolCallId,
              toolName: pendingClientToolInput.toolName,
              input: mappedClientToolInput(pendingClientToolInput),
            });
            return;
          }
          options.write({
            type: "tool-output-available",
            toolCallId: chunk.toolCallId,
            output: chunk.output,
            providerExecuted: true,
          });
          return;
        }
        case "tool-output-error": {
          if (!accepting || messageId === undefined) return;
          if (hiddenToolCallIds.has(chunk.toolCallId)) return;
          const pendingClientToolInput = pendingClientToolInputs.get(
            chunk.toolCallId,
          );
          if (pendingClientToolInput !== undefined) {
            pendingClientToolInputs.delete(chunk.toolCallId);
            options.write({
              type: "tool-input-available",
              toolCallId: pendingClientToolInput.toolCallId,
              toolName: pendingClientToolInput.toolName,
              input: mappedClientToolInput(pendingClientToolInput),
              providerExecuted: true,
            });
          }
          options.write({
            type: "tool-output-error",
            toolCallId: chunk.toolCallId,
            errorText: chunk.errorText,
            providerExecuted: true,
          });
          return;
        }
        case "message-completed": {
          if (!accepting || messageId === undefined) return;
          if (chunk.messageId === messageId) finishTurn();
          return;
        }
        case "message-metadata": {
          if (!accepting || messageId === undefined) return;
          if (chunk.messageId !== messageId) return;
          options.write({
            type: "message-metadata",
            messageMetadata: chunk.metadata,
          });
          return;
        }
        case "data-part": {
          if (!accepting || messageId === undefined) return;
          if (chunk.messageId !== messageId) return;
          options.write({
            type: `data-${chunk.name}`,
            data: chunk.data,
          });
          return;
        }
        default:
          unhandledConversationChunk(chunk);
      }
    },
  };
};
