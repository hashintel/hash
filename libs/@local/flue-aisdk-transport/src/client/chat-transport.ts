import { FlueApiError, FlueExecutionError } from "@flue/sdk";

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

/** The user turn a submission admits, identified by its AI SDK message. */
export interface SubmittedUserMessage {
  readonly messageId: string;
  readonly body: string;
}

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
  /**
   * Derive the admitted user turn from the submitted messages. Defaults to
   * {@link finalUserMessage}; throw to refuse the submission before admission.
   */
  readonly deliveredMessage?: (
    messages: readonly UIMessage[],
  ) => SubmittedUserMessage;
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
      return "The agent may have accepted the message, but admission could not be confirmed. Reopen the conversation before trying again.";
    case "rejected":
      return `The agent rejected the message before admission (HTTP ${failure.status}).`;
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

/** The final message's concatenated text, when it is an identified user message. */
export const finalUserMessage = (
  messages: readonly UIMessage[],
): SubmittedUserMessage => {
  const message = messages.at(-1);
  const body =
    message?.role === "user" && message.id.length > 0
      ? message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
      : "";
  if (message === undefined || body.length === 0) {
    throw new Error("The submitted user message has no text.");
  }
  return { messageId: message.id, body };
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
        mapToolOutput: options.mapToolOutput,
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

    const userMessage = (options.deliveredMessage ?? finalUserMessage)(
      messages,
    );
    const message: DeliveredMessage = { kind: "user", body: userMessage.body };
    const idempotencyKey = `ai-sdk:user:${userMessage.messageId}`;
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
      messageId: userMessage.messageId,
    });
    return streamSubmission(options, admission, abortSignal);
  },
});
