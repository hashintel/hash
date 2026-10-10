import { interviewBudgetContextKey } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createFlueChatTransport,
  FlueChatAdmissionError,
} from "@hashintel/brunch-agent-transport-aisdk";

import {
  getInterviewBudget,
  type InterviewBudgetLevel,
} from "../../../../shared/interview-budget";
import { canonicalPetrinautClientToolNames } from "./tools/brunch-client-tools";

import type {
  AgentSendResult,
  FlueClient,
  FlueConversationState,
} from "@flue/sdk";
import type {
  BrowserContext,
  InterviewBudget,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import type {
  FlueChatResponseMessageCompletedEvent,
  FlueChatResponseMessageStartedEvent,
  FlueChatTransportOptions,
} from "@hashintel/brunch-agent-transport-aisdk";
import type {
  PetrinautAiChatTransport,
  PetrinautAiInputMode,
} from "@hashintel/petrinaut/ui";

export type BrunchPanelAdmission = Parameters<
  NonNullable<FlueChatTransportOptions["onAdmission"]>
>[0];
export type BrunchPanelAdmissionTarget = Pick<
  BrunchPanelAdmission,
  "kind" | "messageId"
>;

export class BrunchPanelConversationTracker {
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
   * during Voice gets the same allowance as the estimate. Until Voice
   * reports, each message's own source decides.
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
    readonly initialData?: BrowserContext;
    readonly interviewBudgetLevel?: InterviewBudgetLevel;
    /** The host's canonical count, shared with the estimate above the composer. */
    readonly interviewRepliesAsked?: number;
    /** Browser tools executed by Petrinaut's static panel registry. */
    readonly clientToolNames?: ReadonlySet<string>;
    readonly dynamicClientToolNames?: FlueChatTransportOptions["dynamicClientToolNames"];
    readonly mapClientToolInput?: FlueChatTransportOptions["mapClientToolInput"];
    readonly onAdmission?: (admission: AgentSendResult) => void;
    readonly liveToolStream?: FlueChatTransportOptions["liveToolStream"];
    readonly onToolOutputError?: FlueChatTransportOptions["onToolOutputError"];
  },
): PetrinautAiChatTransport => ({
  reconnectToStream: async () => null,
  sendMessages: (sendOptions) =>
    tracker.trackSubmission(
      (async () => {
        const client = await clientPromise;
        const budget = getInterviewBudget(
          options?.interviewBudgetLevel ?? "off",
          tracker.inputMode ??
            (sendOptions.messages.at(-1)?.metadata?.source === "voice"
              ? "voice"
              : "text"),
          options?.interviewRepliesAsked ?? 0,
        );
        const transport = createFlueChatTransport({
          client,
          ...(options?.initialData === undefined
            ? {}
            : { initialData: options.initialData }),
          ...(budget === undefined
            ? {}
            : {
                submissionContext: {
                  [interviewBudgetContextKey]: budget satisfies InterviewBudget,
                },
              }),
          clientToolNames:
            options?.clientToolNames ?? canonicalPetrinautClientToolNames,
          dynamicClientToolNames: options?.dynamicClientToolNames,
          mapClientToolInput: options?.mapClientToolInput,
          liveToolStream: options?.liveToolStream,
          onAdmission: (event) => {
            tracker.recordAdmission(event);
            options?.onAdmission?.(event.admission);
          },
          onResponseMessage: (event) => tracker.recordResponse(event),
          onResponseMessageCompleted: (event) =>
            tracker.recordResponseMessageCompleted(event),
          onToolOutputError: options?.onToolOutputError,
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
