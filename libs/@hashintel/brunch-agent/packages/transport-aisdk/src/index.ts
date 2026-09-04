import { FlueApiError, FlueExecutionError } from "@flue/sdk";
import { getToolName, isToolUIPart } from "ai";

import { CLIENT_TOOL_RESULT_SIGNAL } from "./client-tool-result";
import { createFlueUiStream } from "./ui-stream";

import type { AgentSendResult, DeliveredMessage, FlueClient } from "@flue/sdk";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export { BRUNCH_CONVERSATION_HEADER, BRUNCH_PRINCIPAL_HEADER } from "./headers";
export { CLIENT_TOOL_RESULT_SIGNAL } from "./client-tool-result";
export {
  agentOwnershipHeaders,
  flueConversationIdWeb,
  identityPayload,
} from "./identity";
export type { ConversationIdentity } from "./identity";
export {
  snapshotToUiMessages,
  type SnapshotToUiMessagesOptions,
  type UiHistoryMessage,
} from "./transcript";
export { createFlueUiStream, type FlueUiStreamOptions } from "./ui-stream";

export interface ClientToolResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
  readonly source?: "voice";
}

export interface FlueChatTransportOptions {
  readonly client: FlueClient;
  readonly clientToolNames: ReadonlySet<string>;
  readonly hiddenToolNames?: ReadonlySet<string>;
  readonly onAdmission?: (event: {
    readonly admission: AgentSendResult;
    readonly kind: "client-tool-result" | "user";
    readonly messageId: string;
  }) => void;
  readonly onResponseMessage?: (event: {
    readonly messageId: string;
    readonly submissionId: AgentSendResult["submissionId"];
  }) => void;
}

export type FlueChatAdmissionFailure =
  | { readonly kind: "aborted" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "rejected"; readonly status: number }
  | {
      readonly kind: "submission-conflict";
      readonly status: 409;
      readonly submissionId: AgentSendResult["submissionId"];
    };

const admissionFailureMessage = (failure: FlueChatAdmissionFailure): string => {
  switch (failure.kind) {
    case "aborted":
      return "The local chat submission was cancelled.";
    case "ambiguous":
      return "Brunch may have accepted the message, but admission could not be confirmed. Reopen the conversation before trying again.";
    case "rejected":
      return `Brunch rejected the message before admission (HTTP ${failure.status}).`;
    case "submission-conflict":
      return `The delivery key already belongs to admitted submission ${failure.submissionId}; the changed payload was not admitted.`;
  }
};

export class FlueChatAdmissionError extends Error {
  public readonly failure: FlueChatAdmissionFailure;

  public constructor(
    failure: FlueChatAdmissionFailure,
    options?: { readonly cause?: unknown },
  ) {
    super(admissionFailureMessage(failure), options);
    this.name = "FlueChatAdmissionError";
    this.failure = failure;
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const completedClientToolResults = (
  messages: readonly UIMessage[],
  assistantMessageId: string,
  clientToolNames: ReadonlySet<string>,
): readonly ClientToolResult[] => {
  const assistantMessage = messages.find(
    (message) =>
      message.id === assistantMessageId && message.role === "assistant",
  );
  if (assistantMessage === undefined) {
    return [];
  }
  const metadata = asRecord(assistantMessage.metadata);
  const voiceToolCallIds = new Set(
    Array.isArray(metadata?.voiceToolCallIds)
      ? metadata.voiceToolCallIds.filter(
          (toolCallId): toolCallId is string => typeof toolCallId === "string",
        )
      : [],
  );
  if (typeof metadata?.toolCallId === "string") {
    voiceToolCallIds.add(metadata.toolCallId);
  }
  return assistantMessage.parts.flatMap((part): ClientToolResult[] => {
    if (!isToolUIPart(part)) return [];
    const toolName = getToolName(part);
    if (
      !clientToolNames.has(toolName) ||
      part.providerExecuted === true ||
      part.state !== "output-available" ||
      part.toolCallId.length === 0
    ) {
      return [];
    }
    return [
      {
        toolCallId: part.toolCallId,
        toolName,
        output: part.output,
        ...(voiceToolCallIds.has(part.toolCallId)
          ? { source: "voice" as const }
          : {}),
      },
    ];
  });
};

const finalUserMessage = (
  messages: readonly UIMessage[],
): { readonly id: string; readonly text: string } | undefined => {
  const message = messages.at(-1);
  if (
    message === undefined ||
    message.role !== "user" ||
    message.id.length === 0 ||
    message.id === "petrinaut-diagnostics-context"
  ) {
    return undefined;
  }
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  return text.length > 0 ? { id: message.id, text } : undefined;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

const conflictingSubmissionId = (error: FlueApiError): string | null => {
  if (error.status !== 409) return null;
  const body = asRecord(error.body);
  const errorBody = asRecord(body?.error);
  const metadata = asRecord(errorBody?.meta);
  return errorBody?.type === "submission_conflict" &&
    typeof metadata?.submissionId === "string" &&
    metadata.submissionId.length > 0
    ? metadata.submissionId
    : null;
};

const documentedPreAdmissionStatuses = new Set([
  400, 401, 403, 404, 405, 409, 415,
]);

const admissionError = (
  error: unknown,
  signal: AbortSignal | undefined,
): FlueChatAdmissionError => {
  if (signal?.aborted || isAbortError(error)) {
    return new FlueChatAdmissionError({ kind: "aborted" }, { cause: error });
  }
  if (error instanceof FlueApiError) {
    const existingSubmissionId = conflictingSubmissionId(error);
    if (existingSubmissionId !== null) {
      return new FlueChatAdmissionError(
        {
          kind: "submission-conflict",
          status: 409,
          submissionId: existingSubmissionId,
        },
        { cause: error },
      );
    }
    if (documentedPreAdmissionStatuses.has(error.status)) {
      return new FlueChatAdmissionError(
        { kind: "rejected", status: error.status },
        { cause: error },
      );
    }
  }
  return new FlueChatAdmissionError({ kind: "ambiguous" }, { cause: error });
};

const streamFailureChunk = (
  error: unknown,
  signal: AbortSignal,
): Extract<UIMessageChunk, { type: "abort" | "error" }> => {
  if (
    signal.aborted ||
    isAbortError(error) ||
    (error instanceof FlueExecutionError && error.failure === "aborted")
  ) {
    return {
      type: "abort",
      reason:
        error instanceof FlueExecutionError
          ? "The chat turn was stopped."
          : "The local chat stream was cancelled.",
    };
  }
  return {
    type: "error",
    errorText:
      error instanceof FlueExecutionError &&
      error.failure === "terminal_event_missing"
        ? "The chat stream ended before the turn settled."
        : "The chat turn failed.",
  };
};

const streamSubmission = (
  options: FlueChatTransportOptions,
  admission: AgentSendResult,
  continuationMessageId: string | undefined,
  abortSignal: AbortSignal | undefined,
): ReadableStream<UIMessageChunk> => {
  const localAbort = new AbortController();
  const signal =
    abortSignal === undefined
      ? localAbort.signal
      : AbortSignal.any([abortSignal, localAbort.signal]);
  // Shared with `cancel()`: a consumer that cancels the stream closes its
  // controller immediately, so the detached `wait()` settlement below must not
  // write or close again afterwards.
  let closed = false;

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      let terminalEmitted = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      const write = (chunk: UIMessageChunk): void => {
        if (closed) return;
        const projected =
          chunk.type === "start" && continuationMessageId !== undefined
            ? { ...chunk, messageId: continuationMessageId }
            : chunk;
        controller.enqueue(projected);
        if (
          projected.type === "finish" ||
          projected.type === "error" ||
          projected.type === "abort"
        ) {
          terminalEmitted = true;
        }
      };
      const projector = createFlueUiStream({
        submissionId: admission.submissionId,
        clientToolNames: options.clientToolNames,
        hiddenToolNames: options.hiddenToolNames,
        write,
      });

      void options.client
        .wait(admission, {
          signal,
          onEvent: (event) => {
            if (
              event.type === "message-started" &&
              event.submissionId === admission.submissionId
            ) {
              // Report the id the consumer sees: a client-tool continuation is
              // projected onto the assistant message it resumes.
              options.onResponseMessage?.({
                messageId: continuationMessageId ?? event.messageId,
                submissionId: admission.submissionId,
              });
            }
            projector.accept(event);
          },
        })
        .then(close)
        .catch((error: unknown) => {
          if (!terminalEmitted) {
            write(streamFailureChunk(error, signal));
          }
          close();
        });
    },
    cancel(reason) {
      closed = true;
      localAbort.abort(reason);
    },
  });
};

export const createFlueChatTransport = <
  UiMessage extends UIMessage = UIMessage,
>(
  options: FlueChatTransportOptions,
): ChatTransport<UiMessage> => ({
  reconnectToStream: async () => null,
  sendMessages: async ({ trigger, messageId, messages, abortSignal }) => {
    if (trigger !== "submit-message") {
      throw new Error("Regenerating a Flue conversation is not supported.");
    }

    const toolResults =
      messageId === undefined
        ? []
        : completedClientToolResults(
            messages,
            messageId,
            options.clientToolNames,
          );
    const userMessage =
      messageId === undefined ? finalUserMessage(messages) : undefined;
    const message: DeliveredMessage =
      messageId === undefined
        ? (() => {
            if (userMessage === undefined) {
              throw new Error("The submitted user message has no text.");
            }
            return { kind: "user", body: userMessage.text };
          })()
        : (() => {
            if (toolResults.length === 0) {
              throw new Error(
                "The client-tool follow-up has no completed result.",
              );
            }
            return {
              kind: "signal",
              type: CLIENT_TOOL_RESULT_SIGNAL,
              tagName: CLIENT_TOOL_RESULT_SIGNAL,
              body: JSON.stringify(toolResults),
              attributes: {
                toolCallIds: toolResults
                  .map((result) => result.toolCallId)
                  .join(","),
                ...(toolResults.some(({ source }) => source === "voice")
                  ? {
                      voiceToolCallIds: toolResults
                        .filter(({ source }) => source === "voice")
                        .map(({ toolCallId }) => toolCallId)
                        .join(","),
                    }
                  : {}),
              },
            };
          })();
    const idempotencyKey =
      messageId === undefined
        ? `ai-sdk:${userMessage!.id}`
        : `ai-sdk-tool:${messageId}:${toolResults
            .map(({ toolCallId }) => toolCallId)
            .join(",")}`;
    if (Array.from(idempotencyKey).length > 256) {
      throw new Error("The submitted message identity is too long.");
    }

    let admission: AgentSendResult;
    try {
      admission = await options.client.send({
        idempotencyKey,
        message,
        signal: abortSignal,
      });
    } catch (error) {
      throw admissionError(error, abortSignal);
    }
    options.onAdmission?.({
      admission,
      kind: messageId === undefined ? "user" : "client-tool-result",
      messageId: messageId ?? userMessage!.id,
    });
    return streamSubmission(options, admission, messageId, abortSignal);
  },
});
