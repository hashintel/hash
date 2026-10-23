import { generateId } from "ai";

import { petrinautSubmissionContext } from "@hashintel/brunch-agent";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";
import { FlueChatAdmissionError } from "@local/flue-aisdk-transport";

import {
  getInterviewBudget,
  type InterviewBudgetLevel,
} from "../../../../shared/interview-budget";
import { canonicalBrunchFlueAdapter } from "./brunch-flue-adapter";
import { brunchSubmittedUserMessage } from "./brunch-panel-transport/submitted-user-message";

import type { BrunchFlueAdapter } from "./brunch-flue-adapter";
import type {
  PetrinautAiComposerSubmitText,
  PetrinautAiInputMode,
} from "./chat/ai-assistant-composer-control";
import type { PetrinautAiChatTransport } from "./chat/petrinaut";
import type {
  AgentSendResult,
  FlueClient,
  FlueConversationState,
} from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent";
import type {
  FlueChatResponseMessageCompletedEvent,
  FlueChatResponseMessageStartedEvent,
  FlueChatTransportOptions,
} from "@local/flue-aisdk-transport";

export type BrunchPanelAdmission = Parameters<
  NonNullable<FlueChatTransportOptions["onAdmission"]>
>[0];
export type BrunchPanelAdmissionTarget = Pick<
  BrunchPanelAdmission,
  "kind" | "messageId"
>;

export class BrunchPanelConversationTracker {
  readonly #wordsByMessage = new Map<string, readonly string[]>();

  /**
   * The words snapshot for one user message, read once so that a retry of the
   * same message sends the words it was first sent with.
   */
  public captureWords(
    messageId: string,
    read?: () => readonly string[],
  ): readonly string[] {
    const captured = this.#wordsByMessage.get(messageId) ?? read?.() ?? [];
    this.#wordsByMessage.set(messageId, captured);
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
  #inputMode: PetrinautAiInputMode | undefined;

  /**
   * The panel's input surface as reported by Voice, so a text turn sent
   * during Voice gets the same allowance as the estimate. Undefined until
   * Voice first mounts, so until then every submission is text.
   */
  public get inputMode(): PetrinautAiInputMode | undefined {
    return this.#inputMode;
  }

  public recordInputMode(mode: PetrinautAiInputMode): void {
    this.#inputMode = mode;
  }

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
   * also follows swallowed transport errors). The caller must retain the same
   * id and payload when retrying an unconfirmed delivery.
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

  public trackSubmission<T>(submission: Promise<T>): Promise<T> {
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

/** Adapt one mounted Flue conversation to Petrinaut's AI SDK rendering contract. */
export const createBrunchPanelTransport = (
  clientPromise: Promise<FlueClient>,
  tracker: BrunchPanelConversationTracker,
  options?: {
    /** The projection shared with this conversation's reopened history. */
    readonly adapter?: BrunchFlueAdapter;
    /** The conversation's preferred spellings, read when a message is first sent. */
    readonly readWords?: () => readonly string[];
    readonly initialData?: BrowserContext;
    readonly interviewBudgetLevel?: InterviewBudgetLevel;
    /** The host's canonical count, shared with the estimate above the composer. */
    readonly interviewRepliesAsked?: number;
    readonly onAdmission?: (admission: AgentSendResult) => void;
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
        const userMessage = sendOptions.messages.findLast(
          (message) => message.id !== petrinautDiagnosticsContextMessageId,
        );
        const words =
          userMessage === undefined
            ? []
            : tracker.captureWords(userMessage.id, options?.readWords);
        const client = await clientPromise;
        const budget = getInterviewBudget(
          options?.interviewBudgetLevel ?? "off",
          // Voice reports its mode when it mounts, before it can submit.
          tracker.inputMode ?? "text",
          options?.interviewRepliesAsked ?? 0,
        );
        // An empty context sends an ordinary message, which also clears
        // Brunch's words snapshot.
        const submissionContext = petrinautSubmissionContext({
          ...(budget === undefined ? {} : { interviewBudget: budget }),
          words,
        });
        const transport = (
          options?.adapter ?? canonicalBrunchFlueAdapter
        ).chatTransport({
          client,
          submittedUserMessage: (messages) =>
            brunchSubmittedUserMessage(messages, submissionContext),
          initialData: options?.initialData,
          liveToolStream: options?.liveToolStream,
          onAdmission: (event) => {
            tracker.recordAdmission(event);
            options?.onAdmission?.(event.admission);
          },
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

export const createUnavailableBrunchPanelTransport = (
  reason: string,
): PetrinautAiChatTransport => ({
  reconnectToStream: async () => null,
  sendMessages: async () => {
    throw new Error(reason);
  },
});
