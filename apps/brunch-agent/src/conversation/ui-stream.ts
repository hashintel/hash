/** Project Flue live conversation chunks into AI SDK UI-message-stream chunks. */

import { type ConversationStreamChunk } from "@flue/sdk";

import { providerExecutedFor } from "./client-tools.ts";

import type { UIMessageChunk } from "ai";

export interface FlueUiStreamOptions {
  readonly submissionId: string;
  readonly clientToolNames: ReadonlySet<string>;
  readonly write: (chunk: UIMessageChunk) => void;
}

type StreamingPart = {
  readonly kind: "text" | "reasoning";
  readonly partId: string;
};

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
  const pendingClientToolCallIds = new Set<string>();

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
                  pendingClientToolCallIds.size > 0 ? "tool-calls" : "stop",
              });
              break;
            case "failed":
              options.write({
                type: "error",
                errorText: "The chat turn failed.",
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
          // Observe/reconnect machinery, not assistant-message content. This
          // projector emits one AI SDK assistant message for one Flue
          // submission; these chunks are not parts of that message.
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
          const isClientTool = options.clientToolNames.has(chunk.toolName);
          if (isClientTool) pendingClientToolCallIds.add(chunk.toolCallId);
          const providerExecuted = providerExecutedFor(isClientTool);
          options.write({
            type: "tool-input-available",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input,
            ...(providerExecuted === undefined ? {} : { providerExecuted }),
          });
          return;
        }
        case "tool-output": {
          if (!accepting || messageId === undefined) return;
          if (pendingClientToolCallIds.has(chunk.toolCallId)) return;
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
          if (pendingClientToolCallIds.has(chunk.toolCallId)) return;
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
