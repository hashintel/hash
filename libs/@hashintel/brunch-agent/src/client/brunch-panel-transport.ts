import { generateId } from "ai";

import {
  getInterviewBudget,
  parseSelection,
  selectionContextKey,
} from "@hashintel/brunch-agent";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";
import {
  admissionOutcome,
  FlueChatAdmissionError,
} from "@local/flue-aisdk-transport";

import { readRequestInputMode } from "../shared/request-input-mode";
import { canonicalBrunchFlueAdapter } from "./brunch-flue-adapter";
import { brunchSubmittedUserMessage } from "./brunch-panel-transport/submitted-user-message";
import { createSuccessorChatTransport } from "./successor/successor-chat-transport";

import type { PetrinautAiComposerSubmitText } from "../ui/chat/ai-assistant-composer-control";
import type { PetrinautAiMessage } from "../ui/chat/ai-assistant-panel";
import type { PetrinautAiChatTransport } from "../ui/chat/petrinaut";
import type { BrunchFlueAdapter } from "./brunch-flue-adapter";
import type { SuccessorConversation } from "./successor/successor-endpoints";
import type {
  AgentSendResult,
  FlueClient,
  FlueConversationState,
} from "@flue/sdk";
import type {
  BrowserContext,
  InterviewBudgetLevel,
  PetrinautSubmissionContext,
  VersionLoad,
} from "@hashintel/brunch-agent";
import type {
  FlueChatResponseMessageCompletedEvent,
  FlueChatResponseMessageStartedEvent,
  FlueChatTransportOptions,
} from "@local/flue-aisdk-transport";
import type { UIMessageChunk } from "ai";

/**
 * A message the server admitted, by the submission it became. A submission
 * conflict shows only that submission's id, and the durable agents server
 * names a submission by the message's request ID alone, so nothing here
 * reads more of it.
 */
export type BrunchPanelAdmission = Omit<
  Parameters<NonNullable<FlueChatTransportOptions["onAdmission"]>>[0],
  "admission"
> & { readonly admission: Pick<AgentSendResult, "submissionId"> };
export type BrunchPanelAdmissionTarget = Pick<
  BrunchPanelAdmission,
  "kind" | "messageId"
>;

export class BrunchPanelConversationTracker {
  readonly #contextByMessage = new Map<string, PetrinautSubmissionContext>();
  readonly #submittedMessageIds = new Set<string>();

  /**
   * Whether this is the first time the user message is submitted here: a
   * retry of the same delivery, from whichever transport, is not a new one.
   */
  public recordSubmission(messageId: string): boolean {
    if (this.#submittedMessageIds.has(messageId)) return false;
    this.#submittedMessageIds.add(messageId);
    return true;
  }

  /**
   * The submission context for one user message, read once so that a retry of
   * the same message resends the payload it was first sent with: Flue refuses
   * a changed payload under an admitted delivery key.
   */
  public captureSubmissionContext(
    messageId: string,
    read: () => PetrinautSubmissionContext,
  ): PetrinautSubmissionContext {
    const pinned = this.#contextByMessage.get(messageId);
    if (pinned !== undefined) return pinned;
    const captured = read();
    this.#contextByMessage.set(messageId, captured);
    return captured;
  }

  // Local admissions only, scoped to this conversation tracker. Retain until
  // the tracker is replaced; missing retained history fails closed.
  readonly #admittedSubmissionIds = new Set<string>();

  public canReplaceMessages(
    snapshot: FlueConversationState | undefined,
  ): boolean {
    if (snapshot === undefined || this.#inFlightSubmissions.size !== 0)
      return false;
    return [...this.#admittedSubmissionIds].every((submissionId) => {
      const settlement = snapshot.settlements.find(
        (entry) => entry.submissionId === submissionId,
      );
      if (settlement === undefined) return false;
      if (settlement.outcome === "failed" || settlement.outcome === "aborted")
        return true;
      const responseSubmissionId =
        settlement.answeredBySubmissionId ?? submissionId;
      return snapshot.messages.some(
        (message) =>
          message.role === "assistant" &&
          message.purpose === "assistant" &&
          message.submissionId === responseSubmissionId,
      );
    });
  }

  /**
   * Whether a turn this tracker sent may still be running: a submission
   * between `send()` and its admission, or an admitted submission `snapshot`
   * shows no settlement for. Without a snapshot every admitted submission
   * counts, since nothing yet shows it finished. A submission only another tab
   * admitted never counts.
   *
   * Flue's abort is conversation-wide, so this answer only decides whether to
   * send one. When this tracker's submission has settled but `snapshot` does
   * not show it yet (or there is no snapshot), the conversation's running turn
   * may be another tab's newer one, and an abort would stop it; the tracker
   * cannot tell that apart from its own turn still running. If nothing is
   * running, the abort reports `aborted: false` and changes nothing.
   */
  public hasUnsettledTurn(
    snapshot: FlueConversationState | undefined,
  ): boolean {
    if (this.#inFlightSubmissions.size !== 0) return true;
    if (snapshot === undefined) return this.#admittedSubmissionIds.size !== 0;
    return [...this.#admittedSubmissionIds].some(
      (submissionId) =>
        !snapshot.settlements.some(
          (entry) => entry.submissionId === submissionId,
        ),
    );
  }

  readonly #admissionFailureSubscriptions = new Set<{
    readonly listener: (error: FlueChatAdmissionError) => void;
    readonly target: BrunchPanelAdmissionTarget;
  }>();
  readonly #admissionSubscriptions = new Set<{
    readonly listener: (admission: BrunchPanelAdmission) => void;
    readonly target: BrunchPanelAdmissionTarget;
  }>();
  readonly #inFlightSubmissions = new Set<Promise<unknown>>();
  readonly #inputSubmissions = new Map<
    string,
    AgentSendResult["submissionId"]
  >();
  readonly #responseSubmissions = new Map<
    string,
    AgentSendResult["submissionId"][]
  >();
  readonly #responseMessageStartedListeners = new Set<
    (event: FlueChatResponseMessageStartedEvent) => void
  >();
  readonly #responseMessageCompletedListeners = new Set<
    (event: FlueChatResponseMessageCompletedEvent) => void
  >();
  readonly #stopRequestedListeners = new Set<() => void>();

  public recordAdmission(admission: BrunchPanelAdmission): void {
    this.#admittedSubmissionIds.add(admission.admission.submissionId);
    this.#inputSubmissions.set(
      admission.messageId,
      admission.admission.submissionId,
    );
    for (const subscription of this.#admissionSubscriptions) {
      if (subscription.target.messageId === admission.messageId) {
        this.#admissionSubscriptions.delete(subscription);
        subscription.listener(admission);
      }
    }
  }

  /**
   * Host-owned message sends settle on admission, not AI SDK fulfillment (which
   * also follows swallowed transport errors). A retry of an unconfirmed
   * delivery keeps its id; the transport resends the payload first built for
   * it, and records a submission conflict on retry as this message's admission.
   */
  public async submitTextWithAdmission(
    submitText: PetrinautAiComposerSubmitText,
    input: Parameters<PetrinautAiComposerSubmitText>[0],
  ): Promise<{ kind: "message"; messageId: string }> {
    const messageId = input.id ?? generateId();
    const result = { kind: "message" as const, messageId };
    if (this.submissionForInput(messageId) !== undefined) return result;

    const target = { kind: "user" as const, messageId };
    let unsubscribe = () => {};
    let unsubscribeFailure = () => {};
    const admission = new Promise<typeof result>((resolve, reject) => {
      unsubscribe = this.subscribeToAdmission(target, () => resolve(result));
      unsubscribeFailure = this.subscribeToAdmissionFailure(target, reject);
    });
    try {
      return await Promise.race([
        admission,
        Promise.resolve()
          .then(() =>
            submitText({ ...input, id: messageId, target: "message" }),
          )
          .then(
            () => {
              if (this.submissionForInput(messageId) !== undefined)
                return result;
              throw new FlueChatAdmissionError({ kind: "ambiguous" });
            },
            (error: unknown) => {
              // An admitted turn stays delivered even if its response fails.
              if (this.submissionForInput(messageId) !== undefined)
                return result;
              throw error;
            },
          ),
      ]);
    } finally {
      unsubscribe();
      unsubscribeFailure();
    }
  }

  /** Associate each response message with its admitted submission for Voice. */
  public recordResponse(event: FlueChatResponseMessageStartedEvent): void {
    const recorded = this.#responseSubmissions.get(event.messageId);
    if (recorded === undefined) {
      this.#responseSubmissions.set(event.messageId, [event.submissionId]);
    } else if (!recorded.includes(event.submissionId)) {
      recorded.push(event.submissionId);
    }
    for (const listener of this.#responseMessageStartedListeners) {
      listener(event);
    }
  }

  public recordResponseMessageCompleted(
    event: FlueChatResponseMessageCompletedEvent,
  ): void {
    for (const listener of this.#responseMessageCompletedListeners) {
      listener(event);
    }
  }

  public recordStopRequested(): void {
    for (const listener of this.#stopRequestedListeners) {
      listener();
    }
  }

  /**
   * Resolves once every submission currently between `send()` and its
   * admission has been admitted or rejected, so a conversation-wide abort
   * issued afterwards has a settled target rather than racing the admission.
   */
  public settleInFlightSubmissions(): Promise<void> {
    return Promise.allSettled(this.#inFlightSubmissions).then(() => undefined);
  }

  /**
   * {@link hasUnsettledTurn} asked again once the submissions in flight now
   * have settled. A send whose failure proves it never arrived no longer
   * counts; any other failure may have been admitted without this tracker
   * recording it, so it still does.
   */
  public async hasUnsettledTurnAfterSettling(
    snapshot: FlueConversationState | undefined,
  ): Promise<boolean> {
    const outcomes = await Promise.allSettled(this.#inFlightSubmissions);
    const mayBeAdmitted = outcomes.some(
      (outcome) =>
        outcome.status === "fulfilled" ||
        !(
          outcome.reason instanceof FlueChatAdmissionError &&
          admissionOutcome(outcome.reason.failure) === "not-admitted"
        ),
    );
    return mayBeAdmitted || this.hasUnsettledTurn(snapshot);
  }

  #trackedSubmissionCount = 0;

  /** Every send this tracker has started, so a caller can tell one began since it last looked. */
  public get trackedSubmissionCount(): number {
    return this.#trackedSubmissionCount;
  }

  public trackSubmission<T>(submission: Promise<T>): Promise<T> {
    this.#trackedSubmissionCount += 1;
    this.#inFlightSubmissions.add(submission);
    const release = (): void => {
      this.#inFlightSubmissions.delete(submission);
    };
    submission.then(release, release);
    return submission;
  }

  public recordAdmissionFailure(
    target: BrunchPanelAdmissionTarget,
    error: FlueChatAdmissionError,
  ): void {
    for (const subscription of this.#admissionFailureSubscriptions) {
      if (subscription.target.messageId === target.messageId) {
        this.#admissionFailureSubscriptions.delete(subscription);
        subscription.listener(error);
      }
    }
  }

  public submissionForInput(
    messageId: string,
  ): AgentSendResult["submissionId"] | undefined {
    return this.#inputSubmissions.get(messageId);
  }

  public submissionsForResponse(
    messageId: string,
  ): readonly AgentSendResult["submissionId"][] | undefined {
    return this.#responseSubmissions.get(messageId);
  }

  public subscribeToAdmission(
    target: BrunchPanelAdmissionTarget,
    listener: (admission: BrunchPanelAdmission) => void,
  ): () => void {
    const subscription = { listener, target };
    this.#admissionSubscriptions.add(subscription);
    return () => this.#admissionSubscriptions.delete(subscription);
  }

  public subscribeToAdmissionFailure(
    target: BrunchPanelAdmissionTarget,
    listener: (error: FlueChatAdmissionError) => void,
  ): () => void {
    const subscription = { listener, target };
    this.#admissionFailureSubscriptions.add(subscription);
    return () => this.#admissionFailureSubscriptions.delete(subscription);
  }

  public subscribeToResponseMessageCompleted(
    listener: (event: FlueChatResponseMessageCompletedEvent) => void,
  ): () => void {
    this.#responseMessageCompletedListeners.add(listener);
    return () => this.#responseMessageCompletedListeners.delete(listener);
  }

  public subscribeToResponseMessageStarted(
    listener: (event: FlueChatResponseMessageStartedEvent) => void,
  ): () => void {
    this.#responseMessageStartedListeners.add(listener);
    return () => this.#responseMessageStartedListeners.delete(listener);
  }

  public subscribeToStopRequested(listener: () => void): () => void {
    this.#stopRequestedListeners.add(listener);
    return () => this.#stopRequestedListeners.delete(listener);
  }
}

type SendMessagesOptions = Parameters<
  PetrinautAiChatTransport["sendMessages"]
>[0];

/** What the panel sends with each user message, whichever server serves it. */
interface BrunchPanelSubmissionOptions {
  /** The conversation's preferred spellings, read when a message is first sent. */
  readonly readWords?: () => readonly string[];
  readonly interviewBudgetLevel?: InterviewBudgetLevel;
  /** The host's canonical count, shared with the estimate above the composer. */
  readonly interviewRepliesAsked?: number;
  /** The host's latest version load, sent with every message while it stands. */
  readonly versionLoad?: VersionLoad;
  /**
   * The user sent a turn of their own, typed or of comments: called once its
   * payload is built and before the server is asked to admit it, so whether
   * it admits it or not. A retry of the same message, which delivers it
   * again, and a continuation after client tool results are no new turn.
   */
  readonly onSubmission?: (messageId: string) => void;
}

/**
 * The submission context of the message a send delivers, read once per user
 * message so that a retry resends the payload it was first sent with.
 */
const submissionContextFor = (
  tracker: BrunchPanelConversationTracker,
  { messages, body }: Pick<SendMessagesOptions, "messages" | "body">,
  options: BrunchPanelSubmissionOptions | undefined,
): PetrinautSubmissionContext => {
  const userMessage = messages.findLast(
    (message) => message.id !== petrinautDiagnosticsContextMessageId,
  );
  const readSubmissionContext = (): PetrinautSubmissionContext => {
    const budget = getInterviewBudget(
      options?.interviewBudgetLevel ?? "off",
      // The panel's mode when it sent, so a text turn sent during Voice
      // gets the same allowance as the estimate.
      readRequestInputMode(body),
      options?.interviewRepliesAsked ?? 0,
    );
    // An empty context sends an ordinary message, which also clears
    // Brunch's words snapshot.
    return {
      ...(budget === undefined ? {} : { interviewBudget: budget }),
      words: userMessage === undefined ? [] : (options?.readWords?.() ?? []),
      ...(options?.versionLoad === undefined
        ? {}
        : { versionLoad: options.versionLoad }),
      // The chat sends the editor's selection beside the messages.
      selection:
        userMessage === undefined
          ? []
          : parseSelection(
              body !== undefined && selectionContextKey in body
                ? Reflect.get(body, selectionContextKey)
                : undefined,
            ),
    };
  };
  return userMessage?.role === "user"
    ? tracker.captureSubmissionContext(userMessage.id, readSubmissionContext)
    : readSubmissionContext();
};

/** Adapt one mounted Flue conversation to Petrinaut's AI SDK rendering contract. */
export const createBrunchPanelTransport = (
  clientPromise: Promise<FlueClient>,
  tracker: BrunchPanelConversationTracker,
  options?: BrunchPanelSubmissionOptions & {
    /** The projection shared with this conversation's reopened history. */
    readonly adapter?: BrunchFlueAdapter;
    readonly initialData?: BrowserContext;
    readonly onAdmission?: (
      admission: BrunchPanelAdmission["admission"],
    ) => void;
    /**
     * A send met a submission conflict: Flue admitted this message earlier
     * with another payload. A retry resends the payload pinned for it, so the
     * pin was lost (a new tracker, a reload) and whatever changed since did
     * not reach the agent. The send still counts as delivered.
     */
    readonly onSubmissionConflict?: (conflict: {
      readonly messageId: string;
      readonly submissionId: AgentSendResult["submissionId"];
    }) => void;
    readonly liveToolStream?: FlueChatTransportOptions["liveToolStream"];
    readonly onToolOutputError?: FlueChatTransportOptions["onToolOutputError"];
    readonly onReattach?: FlueChatTransportOptions["onReattach"];
    readonly onDisconnect?: FlueChatTransportOptions["onDisconnect"];
  },
): PetrinautAiChatTransport => ({
  reconnectToStream: async () => null,
  sendMessages: (sendOptions) =>
    tracker.trackSubmission(
      (async () => {
        const submissionContext = submissionContextFor(
          tracker,
          sendOptions,
          options,
        );
        const client = await clientPromise;
        const admit = (admission: BrunchPanelAdmission): void => {
          tracker.recordAdmission(admission);
          options?.onAdmission?.(admission.admission);
        };
        let submitted:
          | ReturnType<typeof brunchSubmittedUserMessage>
          | undefined;
        const transport = (
          options?.adapter ?? canonicalBrunchFlueAdapter
        ).chatTransport({
          client,
          submittedUserMessage: (messages) => {
            submitted = brunchSubmittedUserMessage(messages, submissionContext);
            if (tracker.recordSubmission(submitted.messageId))
              options?.onSubmission?.(submitted.messageId);
            return submitted;
          },
          initialData: options?.initialData,
          liveToolStream: options?.liveToolStream,
          onAdmission: admit,
          onResponseMessage: (event) => tracker.recordResponse(event),
          onResponseMessageCompleted: (event) =>
            tracker.recordResponseMessageCompleted(event),
          onToolOutputError: options?.onToolOutputError,
          onReattach: options?.onReattach,
          onDisconnect: options?.onDisconnect,
        });
        try {
          return await transport.sendMessages(sendOptions);
        } catch (error) {
          // Flue admitted this delivery key earlier, as this message: the
          // first response was lost, or this payload differs from that one.
          // The send is delivered, and its reply arrives through the
          // conversation's history, since only the admission's id is known.
          if (
            error instanceof FlueChatAdmissionError &&
            error.failure.kind === "submission-conflict" &&
            submitted !== undefined
          ) {
            admit({
              admission: { submissionId: error.failure.submissionId },
              kind: submitted.message.kind,
              messageId: submitted.messageId,
            });
            options?.onSubmissionConflict?.({
              messageId: submitted.messageId,
              submissionId: error.failure.submissionId,
            });
            return new ReadableStream<UIMessageChunk>({
              start: (controller) => controller.close(),
            });
          }
          const messageId =
            sendOptions.messageId ?? sendOptions.messages.at(-1)?.id;
          if (
            error instanceof FlueChatAdmissionError &&
            messageId !== undefined
          ) {
            tracker.recordAdmissionFailure(
              {
                kind: "user",
                messageId,
              },
              error,
            );
          }
          throw error;
        }
      })(),
    ),
});

/**
 * Adapt one conversation on the durable agents server to Petrinaut's AI SDK
 * rendering contract. Each send delivers the user's message alone, under its
 * own ID, with its submission context framed into its body; a send with no
 * user message last (a continuation after client tool results) sends nothing,
 * since the server continues a turn itself. A message is admitted when the
 * server answers with its stream, and its request ID names its submission.
 */
export const createBrunchSuccessorPanelTransport = (
  conversation: SuccessorConversation,
  tracker: BrunchPanelConversationTracker,
  options: BrunchPanelSubmissionOptions & {
    /** The document the conversation is bound to, sent with every message. */
    readonly documentId: string;
    readonly onAdmission?: (
      admission: BrunchPanelAdmission["admission"],
    ) => void;
  },
): PetrinautAiChatTransport => {
  const transport = createSuccessorChatTransport<PetrinautAiMessage>({
    conversation,
    documentId: options.documentId,
  });
  return {
    reconnectToStream: (reconnectOptions) =>
      transport.reconnectToStream(reconnectOptions),
    sendMessages: (sendOptions) =>
      tracker.trackSubmission(
        (async () => {
          const { messageId, message } = brunchSubmittedUserMessage(
            sendOptions.messages,
            submissionContextFor(tracker, sendOptions, options),
          );
          if (tracker.recordSubmission(messageId))
            options.onSubmission?.(messageId);
          try {
            const stream = await transport.sendMessages({
              ...sendOptions,
              messages: [
                {
                  id: messageId,
                  role: "user",
                  parts: [{ type: "text", text: message.body }],
                },
              ],
            });
            const admission = { submissionId: messageId };
            tracker.recordAdmission({
              admission,
              kind: message.kind,
              messageId,
            });
            options.onAdmission?.(admission);
            return stream;
          } catch (error) {
            if (error instanceof FlueChatAdmissionError) {
              tracker.recordAdmissionFailure(
                { kind: "user", messageId },
                error,
              );
            }
            throw error;
          }
        })(),
      ),
  };
};

export const createUnavailableBrunchPanelTransport = (
  reason: string,
): PetrinautAiChatTransport => ({
  reconnectToStream: async () => null,
  sendMessages: async () => {
    throw new Error(reason);
  },
});
