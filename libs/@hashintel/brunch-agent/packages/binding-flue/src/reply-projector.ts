/** Translate Flue's public live conversation chunks into the harness reply protocol. */

import { type ConversationStreamChunk } from "@flue/sdk";

import { type HarnessReplyEvent } from "@hashintel/brunch-agent";

export interface FlueReplyProjectorOptions {
  readonly submissionId: string;
  readonly emit: (event: HarnessReplyEvent) => void;
}

export interface FlueReplyProjector {
  accept(chunk: ConversationStreamChunk): void;
}

type StreamingPart = {
  readonly kind: "text" | "reasoning";
  readonly partId: string;
};

export const createFlueReplyProjector = (
  options: FlueReplyProjectorOptions,
): FlueReplyProjector => {
  let accepting = false;
  let messageId: string | undefined;
  let turnId: string | undefined;
  let partOrdinal = 0;
  let streamingPart: StreamingPart | undefined;

  const finishPart = (): void => {
    if (!streamingPart) return;
    options.emit({ type: "part-end", ...streamingPart });
    streamingPart = undefined;
  };

  const finishTurn = (): void => {
    finishPart();
    if (!turnId) return;
    options.emit({ type: "turn-finish", turnId });
    turnId = undefined;
  };

  const startPart = (kind: "text" | "reasoning"): StreamingPart => {
    finishPart();
    partOrdinal += 1;
    const part = {
      kind,
      partId: `${messageId}:${kind}:${partOrdinal}`,
    } as const;
    streamingPart = part;
    options.emit({ type: "part-start", ...part });
    return part;
  };

  return {
    accept(chunk) {
      if (chunk.type === "message-started") {
        accepting = chunk.submissionId === options.submissionId;
        if (!accepting) return;

        if (messageId === undefined) {
          messageId = chunk.messageId;
          options.emit({ type: "response-start", messageId });
        }
        finishTurn();
        turnId = chunk.turnId ?? `${messageId}:turn`;
        options.emit({ type: "turn-start", turnId });
        return;
      }

      if (chunk.type === "submission-settled") {
        if (chunk.submissionId !== options.submissionId) return;
        finishTurn();
        options.emit({
          type: "response-finish",
          terminalState: chunk.outcome,
          finishReason: chunk.outcome === "completed" ? "stop" : "error",
        });
        accepting = false;
        return;
      }

      if (!accepting || messageId === undefined) return;

      switch (chunk.type) {
        case "message-delta": {
          if (chunk.messageId !== messageId) return;
          const part =
            streamingPart?.kind === chunk.kind
              ? streamingPart
              : startPart(chunk.kind);
          options.emit({
            type: "part-delta",
            kind: part.kind,
            partId: part.partId,
            delta: chunk.delta,
          });
          return;
        }
        case "tool-input":
          if (chunk.messageId !== messageId) return;
          finishPart();
          options.emit({
            type: "tool-input",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input,
            execution: "server",
          });
          return;
        case "tool-output":
          options.emit({
            type: "tool-output",
            toolCallId: chunk.toolCallId,
            output: chunk.output,
            execution: "server",
          });
          return;
        case "tool-output-error":
          options.emit({
            type: "tool-output-error",
            toolCallId: chunk.toolCallId,
            errorText: chunk.errorText,
            execution: "server",
          });
          return;
        case "message-completed":
          if (chunk.messageId === messageId) finishTurn();
          return;
        case "conversation-reset":
        case "message-appended":
        case "message-metadata":
        case "data-part":
        case "stream-checkpoint":
          return;
      }
    },
  };
};
