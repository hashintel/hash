import { FlueApiError, FlueExecutionError } from "@flue/sdk";

import { CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH } from "./browser-tool-result";
import { petrinautContextualUserMessageBody } from "./contextual-user-message";
import { serializeErrorText } from "./error-text";
import {
  readLiveToolStream,
  type LiveToolStreamOptions,
} from "./live-tool-stream";
import {
  createFlueUiStream,
  type ClientToolProjectionOptions,
  type FlueUiStreamOptions,
} from "./ui-stream";

import type {
  AgentPromptOptions,
  AgentSendResult,
  ConversationStreamChunk,
  DeliveredMessage,
  FlueClient,
} from "@flue/sdk";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export { clientToolHistoryFrom } from "./client-tool-history";
export type { ClientToolResult } from "./browser-tool-result";
export {
  PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX,
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "./contextual-user-message";
export {
  agentOwnershipHeaders,
  flueConversationIdWeb,
  identityPayload,
} from "./identity";
export type { ConversationIdentity } from "./identity";
export { snapshotToUiMessages } from "./transcript";
export { createFlueUiStream } from "./ui-stream";

interface FlueChatResponseMessageEvent {
  readonly messageId: string;
  readonly submissionId: AgentSendResult["submissionId"];
}

export interface FlueChatResponseMessageStartedEvent extends FlueChatResponseMessageEvent {
  readonly position: Extract<
    ConversationStreamChunk,
    { type: "message-started" }
  >["position"];
}

export interface FlueChatResponseMessageCompletedEvent extends FlueChatResponseMessageEvent {
  readonly position: Extract<
    ConversationStreamChunk,
    { type: "message-completed" }
  >["position"];
}

export interface FlueChatTransportOptions extends ClientToolProjectionOptions {
  readonly client: FlueClient;
  /** Opaque host-owned initialization, sent on user submissions only. */
  readonly initialData?: AgentPromptOptions["initialData"];
  /** Best-effort pre-admission presentation; canonical Flue history remains authoritative. */
  readonly liveToolStream?: LiveToolStreamOptions;
  readonly onAdmission?: (event: {
    readonly admission: AgentSendResult;
    readonly kind: "user";
    readonly messageId: string;
  }) => void;
  readonly onResponseMessage?: (
    event: FlueChatResponseMessageStartedEvent,
  ) => void;
  readonly onResponseMessageCompleted?: (
    event: FlueChatResponseMessageCompletedEvent,
  ) => void;
  /**
   * Server tool failures never reach `useChat.onError`; this is the only seam
   * that sees them. Admission, stream and settlement
   * failures stay with `onError` so nothing is reported twice.
   */
  readonly onToolOutputError?: FlueUiStreamOptions["onToolOutputError"];
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

const diagnosticsContextMessageId = "petrinaut-diagnostics-context";

const submittedDiagnosticsContext = (
  messages: readonly UIMessage[],
): string | undefined => {
  const diagnosticsMessages = messages.filter(
    ({ id }) => id === diagnosticsContextMessageId,
  );
  if (diagnosticsMessages.length === 0) return undefined;
  if (diagnosticsMessages.length !== 1) {
    throw new Error("The submission has duplicate diagnostics context.");
  }
  const message = diagnosticsMessages[0]!;
  const part = message.parts[0];
  if (
    message !== messages.at(-1) ||
    message.role !== "user" ||
    message.parts.length !== 1 ||
    part?.type !== "text" ||
    part.text.length === 0 ||
    Array.from(part.text).length > CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH
  ) {
    throw new Error("The submission has invalid or stale diagnostics context.");
  }
  return part.text;
};

const finalUserMessage = (
  messages: readonly UIMessage[],
): { readonly id: string; readonly text: string } | undefined => {
  const message = messages.findLast(
    ({ id }) => id !== diagnosticsContextMessageId,
  );
  if (
    message === undefined ||
    message.role !== "user" ||
    message.id.length === 0
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
        : serializeErrorText(error),
  };
};

const streamSubmission = (
  options: FlueChatTransportOptions,
  admission: AgentSendResult,
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
  let disconnectLive: (() => void) | undefined;

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      let terminalEmitted = false;
      let responseMessage:
        | {
            readonly effectiveId: string;
            readonly flueId: string;
          }
        | undefined;
      const close = (): void => {
        if (closed) return;
        closed = true;
        disconnectLive?.();
        localAbort.abort();
        controller.close();
      };
      const write = (chunk: UIMessageChunk): void => {
        if (closed) return;
        controller.enqueue(chunk);
        if (
          chunk.type === "finish" ||
          chunk.type === "error" ||
          chunk.type === "abort"
        ) {
          terminalEmitted = true;
        }
      };
      const projector = createFlueUiStream({
        submissionId: admission.submissionId,
        clientToolNames: options.clientToolNames,
        dynamicClientToolNames: options.dynamicClientToolNames,
        mapClientToolInput: options.mapClientToolInput,
        onToolOutputError: options.onToolOutputError,
        provisionalMessageId: (turnId) =>
          `live:${admission.submissionId}:${turnId}`,
        write,
      });
      disconnectLive = projector.disconnectLive;
      if (options.liveToolStream !== undefined) {
        void readLiveToolStream({
          conversationUrl: options.client.url,
          onEvent: projector.acceptLive,
          options: options.liveToolStream,
          signal,
          submissionId: admission.submissionId,
        })
          .then(() => {
            if (!signal.aborted) projector.disconnectLive();
          })
          .catch((error: unknown) => {
            options.liveToolStream?.onError?.(error);
            if (!signal.aborted) projector.disconnectLive();
          });
      }

      void options.client
        .wait(admission, {
          signal,
          onEvent: (event) => {
            projector.accept(event);
            if (
              event.type === "message-started" &&
              event.submissionId === admission.submissionId
            ) {
              responseMessage = {
                effectiveId:
                  projector.effectiveMessageId(event.messageId) ??
                  event.messageId,
                flueId: event.messageId,
              };
              options.onResponseMessage?.({
                messageId: responseMessage.effectiveId,
                position: event.position,
                submissionId: admission.submissionId,
              });
            }
            if (
              event.type === "message-completed" &&
              event.messageId === responseMessage?.flueId
            ) {
              options.onResponseMessageCompleted?.({
                messageId: responseMessage.effectiveId,
                position: event.position,
                submissionId: admission.submissionId,
              });
            }
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
      disconnectLive?.();
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
  sendMessages: async ({ trigger, messages, abortSignal }) => {
    if (trigger !== "submit-message") {
      throw new Error("Regenerating a Flue conversation is not supported.");
    }

    const diagnosticsContext = submittedDiagnosticsContext(messages);
    const userMessage = finalUserMessage(messages);
    if (userMessage === undefined) {
      throw new Error("The submitted user message has no text.");
    }
    const message: DeliveredMessage = {
      kind: "user",
      body:
        diagnosticsContext === undefined
          ? userMessage.text
          : petrinautContextualUserMessageBody({
              userText: userMessage.text,
              diagnosticsContext,
            }),
    };
    const idempotencyKey = `ai-sdk:user:${userMessage.id}`;
    if (Array.from(idempotencyKey).length > 256) {
      throw new Error("The submitted message identity is too long.");
    }

    let admission: AgentSendResult;
    try {
      admission = await options.client.send({
        idempotencyKey,
        message,
        ...(options.initialData === undefined
          ? {}
          : { initialData: options.initialData }),
        signal: abortSignal,
      });
    } catch (error) {
      throw admissionError(error, abortSignal);
    }
    options.onAdmission?.({
      admission,
      kind: "user",
      messageId: userMessage.id,
    });
    return streamSubmission(options, admission, abortSignal);
  },
});
