import { FetchError, FlueApiError, FlueExecutionError } from "@flue/sdk";

import { serializeErrorText } from "./error-text";
import {
  readLiveToolStream,
  type LiveToolStreamOptions,
} from "./live-tool-stream";
import { notifyObserver } from "./notify-observer";
import {
  createFlueUiStream,
  type FlueUiProjectionOptions,
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

/** A re-attach to the update stream after Flue's SDK gave up on it. */
export interface FlueChatReattachEvent {
  readonly submissionId: AgentSendResult["submissionId"];
  /** Consecutive re-attaches that projected nothing new, this one included. */
  readonly attempt: number;
  readonly delayMs: number;
  /** The failure Flue's SDK gave up on. */
  readonly error: unknown;
}

/**
 * Host settings for one chat transport; projection comes from the adapter.
 * The `on*` callbacks are observers: one that throws cannot change the turn.
 */
export interface FlueChatTransportOptions {
  readonly client: FlueClient;
  /**
   * Derive the admitted user turn from the submitted messages. Defaults to
   * {@link finalUserMessage}; throw to refuse the submission before admission.
   */
  readonly submittedUserMessage?: (
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
   * Each re-attach the turn survives. When re-attaching gives up, the stream
   * fails with {@link FlueChatDisconnectError}, which only `onError` reports.
   */
  readonly onReattach?: (event: FlueChatReattachEvent) => void;
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

/**
 * The transport stopped following a submission that had not settled, so the
 * turn may still be running; reopened history recovers it. A `TypeError` whose
 * message names the network is what the AI SDK reports as `isDisconnect`.
 */
export class FlueChatDisconnectError extends TypeError {
  public readonly submissionId: AgentSendResult["submissionId"];

  public constructor(
    submissionId: AgentSendResult["submissionId"],
    options?: { readonly cause?: unknown },
  ) {
    super(
      "The network connection to the agent was lost before the chat turn settled; the turn may still be running. Reopen the conversation to recover.",
      options,
    );
    this.name = "FlueChatDisconnectError";
    this.submissionId = submissionId;
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
  return { type: "error", errorText: serializeErrorText(error) };
};

type ChunkPosition = Exclude<
  ConversationStreamChunk,
  { type: "stream-checkpoint" }
>["position"];

const isAfter = (
  position: ChunkPosition,
  watermark: ChunkPosition | undefined,
): boolean =>
  watermark === undefined ||
  position.batch > watermark.batch ||
  (position.batch === watermark.batch && position.index > watermark.index);

/** One pause per consecutive re-attach that projects nothing new. */
const reattachDelaysMs = [250, 500, 1000];

const pause = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });

/** A settled turn or a local cancellation; anything else may be the update stream itself. */
const endsTheTurn = (error: unknown, signal: AbortSignal): boolean =>
  signal.aborted ||
  isAbortError(error) ||
  (error instanceof FlueExecutionError &&
    error.failure !== "terminal_event_missing");

/** Flue's SDK has already spent its own retry budget on 401 and 403. */
const isSpentAuthRetry = (error: unknown): boolean =>
  error instanceof FetchError && (error.status === 401 || error.status === 403);

const streamSubmission = (
  options: FlueChatTransportOptions & FlueUiProjectionOptions,
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
      const fail = (error: FlueChatDisconnectError): void => {
        if (closed) return;
        closed = true;
        disconnectLive?.();
        localAbort.abort();
        controller.error(error);
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
        projectMetadata: options.projectMetadata,
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
            notifyObserver(options.liveToolStream?.onError, error);
            if (!signal.aborted) projector.disconnectLive();
          });
      }

      // Each `wait()` skips chunks it already delivered, but a re-attach is a
      // new `wait()` that replays from the admission offset. Positions only
      // restart when a stream is recreated under a new incarnation, which
      // Flue's durable stores never do to a stream with a live submission.
      let watermark: ChunkPosition | undefined;
      let projectionFailed = false;
      const onEvent = (event: ConversationStreamChunk): void => {
        if (event.type === "stream-checkpoint") return;
        if (!isAfter(event.position, watermark)) return;
        watermark = event.position;
        try {
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
            notifyObserver(options.onResponseMessage, {
              messageId: responseMessage.effectiveId,
              position: event.position,
              submissionId: admission.submissionId,
            });
          }
          if (
            event.type === "message-completed" &&
            event.messageId === responseMessage?.flueId
          ) {
            notifyObserver(options.onResponseMessageCompleted, {
              messageId: responseMessage.effectiveId,
              position: event.position,
              submissionId: admission.submissionId,
            });
          }
        } catch (error) {
          projectionFailed = true;
          throw error;
        }
      };

      const follow = async (): Promise<void> => {
        let fruitlessReattaches = 0;
        for (;;) {
          const watermarkBefore = watermark;
          try {
            // Each re-attach depends on the failure of the one before.
            // eslint-disable-next-line no-await-in-loop
            await options.client.wait(admission, { signal, onEvent });
            return;
          } catch (error) {
            if (
              projectionFailed ||
              terminalEmitted ||
              endsTheTurn(error, signal)
            ) {
              throw error;
            }
            if (watermark !== watermarkBefore) fruitlessReattaches = 0;
            const delay = reattachDelaysMs[fruitlessReattaches];
            if (delay === undefined || isSpentAuthRetry(error)) {
              throw new FlueChatDisconnectError(admission.submissionId, {
                cause: error,
              });
            }
            fruitlessReattaches += 1;
            notifyObserver(options.onReattach, {
              submissionId: admission.submissionId,
              attempt: fruitlessReattaches,
              delayMs: delay,
              error,
            });
            // eslint-disable-next-line no-await-in-loop
            await pause(delay, signal);
            signal.throwIfAborted();
          }
        }
      };

      void follow()
        .then(close)
        .catch((error: unknown) => {
          if (error instanceof FlueChatDisconnectError && !terminalEmitted) {
            fail(error);
            return;
          }
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

export const createFlueChatTransport = (
  options: FlueChatTransportOptions & FlueUiProjectionOptions,
): ChatTransport<UIMessage> => ({
  reconnectToStream: async () => null,
  sendMessages: async ({ trigger, messages, abortSignal }) => {
    if (trigger !== "submit-message") {
      throw new Error("Regenerating a Flue conversation is not supported.");
    }

    const userMessage = (options.submittedUserMessage ?? finalUserMessage)(
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
        initialData: options.initialData,
        signal: abortSignal,
      });
    } catch (error) {
      throw admissionError(error, abortSignal);
    }
    notifyObserver(options.onAdmission, {
      admission,
      kind: "user",
      messageId: userMessage.messageId,
    });
    return streamSubmission(options, admission, abortSignal);
  },
});
