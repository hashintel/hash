import { serializeErrorText } from "./error-text";

import type { LiveToolStreamEvent } from "./live-tool-stream";
import type { AgentSendResult, ConversationStreamChunk } from "@flue/sdk";
import type { UIMessageChunk } from "ai";

/** How client-executed tools project into the AI SDK UI, live or from history. */
export interface ClientToolProjectionOptions {
  readonly clientToolNames: ReadonlySet<string>;
  /** Calls executed during the same Flue turn; their outcome is provider-executed for AI SDK. */
  readonly asyncClientToolNames?: ReadonlySet<string>;
  /** Host-defined tools that are not part of the AI SDK's static tool registry. */
  readonly dynamicClientToolNames?: ReadonlySet<string>;
  /** These client calls are not executable until their server tool has succeeded. */
  readonly validatedClientToolNames?: ReadonlySet<string>;
  readonly mapClientToolInput?: (
    call: Pick<
      Extract<ConversationStreamChunk, { type: "tool-input" }>,
      "input" | "toolName" | "toolCallId"
    >,
  ) => unknown;
}

/**
 * A server tool that failed on this submission. Reported before projection
 * decides whether the UI sees it, so pending-client tools are included;
 * `errorText` is the server's text and may quote content, so hosts classify
 * it before it leaves the browser.
 */
export interface FlueUiToolOutputError {
  readonly submissionId: AgentSendResult["submissionId"];
  readonly toolCallId: string;
  /** Undefined when the failing call's input was never seen on this stream. */
  readonly toolName: string | undefined;
  readonly errorText: string;
}

export interface FlueUiStreamOptions extends ClientToolProjectionOptions {
  readonly submissionId: AgentSendResult["submissionId"];
  readonly write: (chunk: UIMessageChunk) => void;
  readonly onToolOutputError?: (event: FlueUiToolOutputError) => void;
  readonly provisionalMessageId?: (turnId: string) => string;
  readonly liveStartDelayMs?: number;
}

export interface FlueUiStream {
  readonly accept: (chunk: ConversationStreamChunk) => void;
  readonly acceptLive: (event: LiveToolStreamEvent) => void;
  readonly disconnectLive: () => void;
  readonly effectiveMessageId: (
    canonicalMessageId: string,
  ) => string | undefined;
}

type StreamingPart = {
  readonly kind: Extract<
    ConversationStreamChunk,
    { type: "message-delta" }
  >["kind"];
  readonly partId: string;
};

const unhandledConversationChunk = (chunk: never): never => {
  throw new Error(
    `Unhandled Flue conversation chunk: ${JSON.stringify(chunk)}`,
  );
};

export const createFlueUiStream = (
  options: FlueUiStreamOptions,
): FlueUiStream => {
  let accepting = false;
  let canonicalMessageId: string | undefined;
  let liveDisconnected = false;
  let liveStartTimer: ReturnType<typeof setTimeout> | undefined;
  const liveTerminalTimers = new Set<ReturnType<typeof setTimeout>>();
  let lastLiveSequence = -1;
  let messageId: string | undefined;
  let turnId: string | undefined;
  let partOrdinal = 0;
  let streamingPart: StreamingPart | undefined;
  const toolNamesByCallId = new Map<string, string>();
  const pendingClientToolCallIds = new Set<string>();
  const awaitingValidation = new Map<
    string,
    Extract<ConversationStreamChunk, { type: "tool-input" }>
  >();
  const admittedToolCallIds = new Set<string>();
  const terminalLiveTurns = new Set<string>();
  const speculativeToolCalls = new Map<
    string,
    { readonly toolName: string; readonly turnId: string }
  >();
  const bufferedLiveEvents = new Map<string, LiveToolStreamEvent[]>();
  const publishClientInput = (
    chunk: Extract<ConversationStreamChunk, { type: "tool-input" }>,
  ) => {
    options.write({
      type: "tool-input-available",
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      input:
        options.mapClientToolInput === undefined
          ? chunk.input
          : options.mapClientToolInput({
              input: chunk.input,
              toolName: chunk.toolName,
              toolCallId: chunk.toolCallId,
            }),
      ...(options.dynamicClientToolNames?.has(chunk.toolName) === true
        ? { dynamic: true }
        : {}),
    });
  };

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

  const terminateSpeculativeCall = (toolCallId: string): void => {
    const call = speculativeToolCalls.get(toolCallId);
    if (call === undefined) return;
    speculativeToolCalls.delete(toolCallId);
    if (admittedToolCallIds.has(toolCallId)) return;
    options.write({
      type: "tool-input-error",
      toolCallId,
      toolName: call.toolName,
      input: undefined,
      errorText: "This tool proposal was not executed.",
      ...(options.dynamicClientToolNames?.has(call.toolName) === true
        ? { dynamic: true }
        : {}),
    });
  };

  const terminateSpeculativeTurn = (terminalTurnId: string): void => {
    terminalLiveTurns.add(terminalTurnId);
    bufferedLiveEvents.delete(terminalTurnId);
    for (const [toolCallId, call] of speculativeToolCalls) {
      if (call.turnId === terminalTurnId) terminateSpeculativeCall(toolCallId);
    }
  };

  const terminateAllSpeculativeCalls = (): void => {
    bufferedLiveEvents.clear();
    for (const toolCallId of speculativeToolCalls.keys()) {
      terminateSpeculativeCall(toolCallId);
    }
  };

  const afterCanonicalRace = (terminate: () => void): void => {
    if (options.provisionalMessageId === undefined) {
      terminate();
      return;
    }
    const timer = setTimeout(() => {
      liveTerminalTimers.delete(timer);
      terminate();
    }, 100);
    liveTerminalTimers.add(timer);
  };

  const clearLiveTerminalTimers = (): void => {
    for (const timer of liveTerminalTimers) clearTimeout(timer);
    liveTerminalTimers.clear();
  };

  const publishLiveEvent = (event: LiveToolStreamEvent): void => {
    if (
      event.kind === "submission-finished" ||
      event.kind === "turn-finished"
    ) {
      return;
    }
    if (
      terminalLiveTurns.has(event.turnId) ||
      admittedToolCallIds.has(event.toolCallId)
    ) {
      return;
    }
    if (event.kind === "tool-input-start") {
      if (speculativeToolCalls.has(event.toolCallId)) return;
      speculativeToolCalls.set(event.toolCallId, {
        toolName: event.toolName,
        turnId: event.turnId,
      });
      options.write({
        type: "tool-input-start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(options.dynamicClientToolNames?.has(event.toolName) === true
          ? { dynamic: true }
          : {}),
      });
      return;
    }
    const call = speculativeToolCalls.get(event.toolCallId);
    if (
      call === undefined ||
      call.turnId !== event.turnId ||
      call.toolName !== event.toolName
    ) {
      return;
    }
    options.write({
      type: "tool-input-delta",
      toolCallId: event.toolCallId,
      inputTextDelta: event.inputTextDelta,
    });
  };

  const startProvisionalTurn = (provisionalTurnId: string): void => {
    if (
      messageId !== undefined ||
      options.provisionalMessageId === undefined ||
      terminalLiveTurns.has(provisionalTurnId)
    ) {
      return;
    }
    messageId = options.provisionalMessageId(provisionalTurnId);
    turnId = provisionalTurnId;
    accepting = true;
    options.write({ type: "start", messageId });
    options.write({ type: "start-step" });
    const buffered = bufferedLiveEvents.get(provisionalTurnId);
    if (buffered !== undefined) {
      bufferedLiveEvents.delete(provisionalTurnId);
      for (const event of buffered) publishLiveEvent(event);
    }
  };

  const acceptLive = (event: LiveToolStreamEvent): void => {
    if (
      liveDisconnected ||
      event.submissionId !== options.submissionId ||
      event.sequence <= lastLiveSequence
    ) {
      return;
    }
    lastLiveSequence = event.sequence;
    if (event.kind === "submission-finished") {
      if (liveStartTimer !== undefined) {
        clearTimeout(liveStartTimer);
        liveStartTimer = undefined;
      }
      afterCanonicalRace(terminateAllSpeculativeCalls);
      liveDisconnected = true;
      return;
    }
    if (event.kind === "turn-finished") {
      terminalLiveTurns.add(event.turnId);
      bufferedLiveEvents.delete(event.turnId);
      afterCanonicalRace(() => terminateSpeculativeTurn(event.turnId));
      return;
    }
    if (event.turnId !== turnId) {
      if (!terminalLiveTurns.has(event.turnId)) {
        const buffered = bufferedLiveEvents.get(event.turnId) ?? [];
        buffered.push(event);
        bufferedLiveEvents.set(event.turnId, buffered);
        if (
          messageId === undefined &&
          liveStartTimer === undefined &&
          options.provisionalMessageId !== undefined
        ) {
          liveStartTimer = setTimeout(() => {
            liveStartTimer = undefined;
            startProvisionalTurn(event.turnId);
          }, options.liveStartDelayMs ?? 10);
        }
      }
      return;
    }
    publishLiveEvent(event);
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
          if (liveStartTimer !== undefined) {
            clearTimeout(liveStartTimer);
            liveStartTimer = undefined;
          }

          if (messageId === undefined) {
            messageId = chunk.messageId;
            canonicalMessageId = chunk.messageId;
            options.write({ type: "start", messageId });
          } else if (
            canonicalMessageId === undefined &&
            chunk.turnId === turnId
          ) {
            canonicalMessageId = chunk.messageId;
            return;
          } else if (
            canonicalMessageId !== undefined &&
            chunk.messageId !== canonicalMessageId &&
            pendingClientToolCallIds.size > 0
          ) {
            // Flue may append a waiting reply after yielding to the browser.
            // An empty trailing AI SDK step would strand the client tool.
            return;
          }
          canonicalMessageId = chunk.messageId;
          finishTurn();
          turnId = chunk.turnId ?? `${messageId}:turn`;
          options.write({ type: "start-step" });
          const buffered = bufferedLiveEvents.get(turnId);
          if (buffered !== undefined) {
            bufferedLiveEvents.delete(turnId);
            for (const event of buffered) publishLiveEvent(event);
          }
          return;
        }
        case "submission-settled": {
          if (chunk.submissionId !== options.submissionId) return;
          clearLiveTerminalTimers();
          if (liveStartTimer !== undefined) {
            clearTimeout(liveStartTimer);
            liveStartTimer = undefined;
          }
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
          terminateAllSpeculativeCalls();
          return;
        }
        case "conversation-reset":
        case "message-appended":
        case "stream-checkpoint":
          return;
        case "message-delta": {
          if (!accepting || messageId === undefined) return;
          if (chunk.messageId !== canonicalMessageId) return;
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
          if (chunk.messageId !== canonicalMessageId) return;
          finishPart();
          toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
          admittedToolCallIds.add(chunk.toolCallId);
          const isClientTool = options.clientToolNames.has(chunk.toolName);
          if (
            isClientTool &&
            !options.asyncClientToolNames?.has(chunk.toolName)
          )
            pendingClientToolCallIds.add(chunk.toolCallId);
          if (
            isClientTool &&
            options.validatedClientToolNames?.has(chunk.toolName)
          ) {
            awaitingValidation.set(chunk.toolCallId, chunk);
            if (!speculativeToolCalls.delete(chunk.toolCallId)) {
              options.write({
                type: "tool-input-start",
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                ...(options.dynamicClientToolNames?.has(chunk.toolName) === true
                  ? { dynamic: true }
                  : {}),
              });
            }
            return;
          }
          speculativeToolCalls.delete(chunk.toolCallId);
          options.write({
            type: "tool-input-available",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input:
              isClientTool && options.mapClientToolInput !== undefined
                ? options.mapClientToolInput({
                    input: chunk.input,
                    toolName: chunk.toolName,
                    toolCallId: chunk.toolCallId,
                  })
                : chunk.input,
            ...(isClientTool ? {} : { providerExecuted: true }),
            ...(options.dynamicClientToolNames?.has(chunk.toolName) === true
              ? { dynamic: true }
              : {}),
          });
          return;
        }
        case "tool-output": {
          if (!accepting || messageId === undefined) return;
          const validated = awaitingValidation.get(chunk.toolCallId);
          if (validated) {
            awaitingValidation.delete(chunk.toolCallId);
            publishClientInput(validated);
            return;
          }
          if (pendingClientToolCallIds.has(chunk.toolCallId)) return;
          const result = chunk.output;
          options.write({
            type: "tool-output-available",
            toolCallId: chunk.toolCallId,
            output:
              typeof result === "object" &&
              result !== null &&
              "brunchBrowserResult" in result &&
              result.brunchBrowserResult === true &&
              "output" in result
                ? result.output
                : result,
            providerExecuted: true,
          });
          return;
        }
        case "tool-output-error": {
          if (!accepting || messageId === undefined) return;
          options.onToolOutputError?.({
            submissionId: options.submissionId,
            toolCallId: chunk.toolCallId,
            toolName: toolNamesByCallId.get(chunk.toolCallId),
            errorText: chunk.errorText,
          });
          if (awaitingValidation.delete(chunk.toolCallId)) {
            pendingClientToolCallIds.delete(chunk.toolCallId);
          } else if (pendingClientToolCallIds.has(chunk.toolCallId)) return;
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
          if (chunk.messageId === canonicalMessageId) finishTurn();
          return;
        }
        case "message-metadata": {
          if (!accepting || messageId === undefined) return;
          if (chunk.messageId !== canonicalMessageId) return;
          options.write({
            type: "message-metadata",
            messageMetadata: chunk.metadata,
          });
          return;
        }
        case "data-part": {
          if (!accepting || messageId === undefined) return;
          if (chunk.messageId !== canonicalMessageId) return;
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
    acceptLive,
    disconnectLive: () => {
      if (liveDisconnected) return;
      liveDisconnected = true;
      clearLiveTerminalTimers();
      if (liveStartTimer !== undefined) {
        clearTimeout(liveStartTimer);
        liveStartTimer = undefined;
      }
      terminateAllSpeculativeCalls();
    },
    effectiveMessageId: (candidate) =>
      candidate === canonicalMessageId ? messageId : undefined,
  };
};
