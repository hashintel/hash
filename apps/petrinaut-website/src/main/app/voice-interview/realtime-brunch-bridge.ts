import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";

import { selectCanonicalSpeech } from "./canonical-speech";

import type {
  CanonicalSpeechSegment,
  CanonicalSpeechSelection,
} from "./canonical-speech";
import type {
  OpenAIRealtimeSession,
  OpenAIRealtimeSessionEvent,
  OpenAIRealtimeTranscriptKey,
} from "./openai-realtime-session";
import type { AgentSendResult, FlueConversationSettlement } from "@flue/sdk";
import type {
  FlueChatAdmissionFailure,
  FlueChatResponseMessageCompletedEvent,
  FlueChatResponseMessageStartedEvent,
  FlueChatTransportOptions,
} from "@hashintel/brunch-agent-transport-aisdk";
import type {
  PetrinautAiComposerSubmitTextResult,
  PetrinautAiVoiceModeContext,
} from "@hashintel/petrinaut/ui";

export type VoiceSubmissionSettlement = Pick<
  FlueConversationSettlement,
  "outcome" | "submissionId"
>;

interface ChatUpdate {
  readonly canAcceptInterviewAnswer: boolean;
  readonly canonicalSegments: CanonicalSpeechSegment[];
  readonly questionSegment?: CanonicalSpeechSegment;
  readonly stopped?: boolean;
  readonly settlements?: readonly VoiceSubmissionSettlement[];
  readonly status: PetrinautAiVoiceModeContext["status"];
}

type SubmitVoiceInput = Parameters<
  PetrinautAiVoiceModeContext["submitVoiceInput"]
>[0];
type FlueChatAdmission = Parameters<
  NonNullable<FlueChatTransportOptions["onAdmission"]>
>[0];
export type RealtimeBrunchAdmissionTarget = Pick<
  FlueChatAdmission,
  "kind" | "messageId"
>;

type SubmitInterviewAnswerInput = Pick<
  SubmitVoiceInput,
  "text" | "onQueued" | "onTurnComplete"
> & {
  readonly admissionTarget: RealtimeBrunchAdmissionTarget;
  readonly id: string;
  readonly target: "message";
  readonly onAdmission: (submissionId: AgentSendResult["submissionId"]) => void;
  readonly signal: AbortSignal;
};

type SubmitInterviewAnswerResult = PetrinautAiComposerSubmitTextResult & {
  readonly submissionId?: AgentSendResult["submissionId"];
};

interface RealtimeBrunchBridgeDependencies {
  readonly session: Pick<
    OpenAIRealtimeSession,
    "speakNotice" | "speakParaphrase" | "subscribe"
  >;
  readonly submitInterviewAnswer: (
    input: SubmitInterviewAnswerInput,
  ) => Promise<SubmitInterviewAnswerResult>;
}

/** Delivery correlation only. The panel owns the input FIFO and browser work. */
interface Delivery {
  readonly abortController: AbortController;
  readonly deliveryId: string;
  readonly messageIds: Set<string>;
  readonly settlements: Map<
    string,
    VoiceSubmissionSettlement["outcome"] | undefined
  >;
  accepted: boolean;
  firstTextEmitted: boolean;
  queued: boolean;
  speechCancelled: boolean;
  submissionId?: string;
  completedResponse?: CanonicalSpeechSelection;
}

type RealtimeAdmissionErrorCode =
  | "admission-aborted"
  | "admission-ambiguous"
  | "admission-conflict"
  | "admission-rejected";
type RealtimeInterviewErrorCode =
  | "interview-correlation"
  | "interview-response"
  | "interview-submission";
export type RealtimeBridgeErrorCode =
  | RealtimeAdmissionErrorCode
  | RealtimeInterviewErrorCode;
export type RealtimeTranscriptRejectionReason =
  | "duplicate"
  | "empty"
  | "failed"
  | "over-limit"
  | "unavailable";

export type RealtimeBrunchBridgeEvent =
  | {
      readonly answer: string;
      readonly deliveryId: string;
      readonly type: "submission-started";
    }
  | {
      readonly answer: string;
      readonly deliveryId: string;
      readonly type: "submission-accepted";
    }
  | {
      readonly answer: string;
      readonly deliveryId: string;
      readonly type: "submission-queued";
    }
  | {
      readonly deliveryId: string;
      readonly submissionId: string;
      readonly type: "submission-admitted";
    }
  | {
      readonly deliveryId: string;
      readonly submissionId: string;
      readonly type: "continuation-admitted";
    }
  | {
      readonly deliveryId: string;
      readonly questionSegment?: CanonicalSpeechSegment;
      readonly segments: CanonicalSpeechSegment[];
      readonly speechCancelled?: true;
      readonly type: "canonical-response-ready";
    }
  | {
      readonly deliveryId: string;
      readonly type: "canonical-text-ready";
    }
  | {
      readonly deliveryId: string;
      readonly type: "submission-settled";
    }
  | {
      readonly deliveryId: string;
      readonly outcome:
        | Exclude<VoiceSubmissionSettlement["outcome"], "completed">
        | "withheld";
      readonly type: "submission-stopped";
    }
  | {
      readonly reason: RealtimeTranscriptRejectionReason;
      readonly type: "transcript-rejected";
    }
  | {
      readonly code: RealtimeInterviewErrorCode;
      readonly message: string;
      readonly type: "error";
    }
  | {
      readonly code: RealtimeAdmissionErrorCode;
      readonly failure: FlueChatAdmissionFailure;
      readonly message: string;
      readonly type: "error";
    };

const admissionErrorCode = (
  failure: FlueChatAdmissionFailure,
): RealtimeAdmissionErrorCode => {
  switch (failure.kind) {
    case "aborted":
      return "admission-aborted";
    case "ambiguous":
      return "admission-ambiguous";
    case "rejected":
      return "admission-rejected";
    case "submission-conflict":
      return "admission-conflict";
  }
};

export const createRealtimeSubmissionId = ({
  connectionEpoch,
  contentIndex,
  itemId,
}: OpenAIRealtimeTranscriptKey): string =>
  `voice-realtime:${connectionEpoch}:${encodeURIComponent(itemId)}:${contentIndex}`;

/* eslint-disable no-param-reassign -- Delivery parameters are bridge-owned mutable state-machine records, never caller inputs. */
export class RealtimeBrunchBridge {
  readonly #deliveries = new Map<string, Delivery>();
  readonly #listeners = new Set<(event: RealtimeBrunchBridgeEvent) => void>();
  readonly #processedTranscripts = new Set<string>();
  readonly #session: RealtimeBrunchBridgeDependencies["session"];
  readonly #submitInterviewAnswer: RealtimeBrunchBridgeDependencies["submitInterviewAnswer"];
  #activeEpoch: number | null = null;
  #canAcceptInput = false;

  public constructor({
    session,
    submitInterviewAnswer,
  }: RealtimeBrunchBridgeDependencies) {
    this.#session = session;
    this.#submitInterviewAnswer = submitInterviewAnswer;
    session.subscribe((event) => this.#handleSessionEvent(event));
  }

  public subscribe(
    listener: (event: RealtimeBrunchBridgeEvent) => void,
  ): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public start(connectionEpoch: number): void {
    this.stop();
    this.resume(connectionEpoch);
  }

  public resume(connectionEpoch: number): void {
    this.#activeEpoch = connectionEpoch;
  }

  public suspend(): void {
    this.#activeEpoch = null;
    this.cancelPendingSpeech();
  }

  public stop(): void {
    this.#activeEpoch = null;
    const deliveries = [...this.#deliveries.values()];
    this.#deliveries.clear();
    for (const delivery of deliveries) delivery.abortController.abort();
    this.#processedTranscripts.clear();
  }

  public cancelPendingSpeech(): void {
    for (const delivery of this.#deliveries.values()) {
      if (!delivery.queued || delivery.submissionId !== undefined)
        delivery.speechCancelled = true;
    }
  }

  /** Output cancellation never restores permission for an already cancelled reply. */
  public completeTurnHandoff(): void {}

  public notifyAdmission(
    event: RealtimeBrunchAdmissionTarget & {
      readonly admission: Pick<AgentSendResult, "submissionId">;
    },
  ): void {
    if (event.kind !== "client-tool-result") return;
    for (const delivery of this.#deliveries.values()) {
      if (
        !delivery.messageIds.has(event.messageId) ||
        delivery.settlements.has(event.admission.submissionId)
      )
        continue;
      delivery.settlements.set(event.admission.submissionId, undefined);
      this.#emit({
        type: "continuation-admitted",
        deliveryId: delivery.deliveryId,
        submissionId: event.admission.submissionId,
      });
      if (!delivery.speechCancelled && this.#activeEpoch !== null)
        this.#notice("continuing", delivery);
    }
  }

  public notifyResponseMessageStarted(
    event: FlueChatResponseMessageStartedEvent,
  ): void {
    for (const delivery of this.#deliveries.values()) {
      if (delivery.settlements.has(event.submissionId))
        delivery.messageIds.add(event.messageId);
    }
  }

  public notifyResponseMessageCompleted(
    event: FlueChatResponseMessageCompletedEvent,
  ): void {
    // Message completion identifies content, never whole-turn success.
    this.notifyResponseMessageStarted(event);
  }

  public notifySubmissionSettled(event: VoiceSubmissionSettlement): void {
    for (const delivery of this.#deliveries.values()) {
      if (!delivery.settlements.has(event.submissionId)) continue;
      delivery.settlements.set(event.submissionId, event.outcome);
      if (event.outcome !== "completed")
        this.#stopDelivery(delivery, event.outcome);
      else this.#complete(delivery);
    }
  }

  public updateChat(update: ChatUpdate): void {
    this.#canAcceptInput = update.canAcceptInterviewAnswer;
    for (const settlement of update.settlements ?? [])
      this.notifySubmissionSettled(settlement);
    for (const delivery of this.#deliveries.values()) {
      if (update.stopped && delivery.submissionId !== undefined) {
        this.#stopDelivery(delivery, "withheld");
      } else if (
        !delivery.firstTextEmitted &&
        update.canonicalSegments.some(({ messageId }) =>
          delivery.messageIds.has(messageId),
        )
      ) {
        delivery.firstTextEmitted = true;
        this.#emit({
          type: "canonical-text-ready",
          deliveryId: delivery.deliveryId,
        });
      }
    }
  }

  #emit(event: RealtimeBrunchBridgeEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #stopDelivery(
    delivery: Delivery,
    outcome: Extract<
      RealtimeBrunchBridgeEvent,
      { type: "submission-stopped" }
    >["outcome"],
  ): void {
    this.#deliveries.delete(delivery.deliveryId);
    this.#emit({ type: "submission-settled", deliveryId: delivery.deliveryId });
    this.#emit({
      type: "submission-stopped",
      deliveryId: delivery.deliveryId,
      outcome,
    });
  }

  #notice(
    kind: "received" | "queued" | "continuing",
    delivery: Delivery,
  ): void {
    try {
      this.#session.speakNotice(kind, delivery.deliveryId);
    } catch {
      // Audio failure must not prevent admission or cancel domain work.
      delivery.speechCancelled = true;
      this.#emit({
        type: "error",
        code: "interview-response",
        message:
          "Voice delivery failed. Brunch's response remains in the conversation.",
      });
    }
  }

  #handleSessionEvent(event: OpenAIRealtimeSessionEvent): void {
    if (event.type !== "completed" && event.type !== "transcription-failed")
      return;
    if (event.key.connectionEpoch !== this.#activeEpoch) return;
    const deliveryId = createRealtimeSubmissionId(event.key);
    const reject = (reason: RealtimeTranscriptRejectionReason) =>
      this.#emit({ reason, type: "transcript-rejected" });
    if (this.#processedTranscripts.has(deliveryId)) {
      reject("duplicate");
      return;
    }
    this.#processedTranscripts.add(deliveryId);
    if (event.type === "transcription-failed") {
      reject("failed");
      return;
    }
    if (!event.text.trim()) {
      reject("empty");
      return;
    }
    if (Array.from(event.text).length > 32_000) {
      reject("over-limit");
      return;
    }
    if (!this.#canAcceptInput) {
      reject("unavailable");
      return;
    }
    const delivery: Delivery = {
      abortController: new AbortController(),
      deliveryId,
      messageIds: new Set(),
      settlements: new Map(),
      accepted: false,
      firstTextEmitted: false,
      queued: false,
      speechCancelled: false,
    };
    this.#deliveries.set(deliveryId, delivery);
    this.#emit({ answer: event.text, deliveryId, type: "submission-started" });
    void this.#submit(delivery, event.text);
  }

  async #submit(delivery: Delivery, answer: string): Promise<void> {
    const { deliveryId } = delivery;
    const current = () => this.#deliveries.get(deliveryId) === delivery;
    const failCorrelation = () => {
      this.#deliveries.delete(deliveryId);
      this.#emit({
        type: "error",
        code: "interview-correlation",
        message:
          "The voice response could not be matched to its submission. Use the conversation to recover.",
      });
    };
    try {
      const pending = this.#submitInterviewAnswer({
        admissionTarget: { kind: "user", messageId: deliveryId },
        id: deliveryId,
        target: "message",
        text: answer,
        signal: delivery.abortController.signal,
        onAdmission: (submissionId) => {
          if (!current()) return;
          if (delivery.submissionId !== undefined) {
            if (delivery.submissionId !== submissionId) failCorrelation();
            return;
          }
          delivery.submissionId = submissionId;
          delivery.settlements.set(submissionId, undefined);
          this.#emit({ type: "submission-admitted", deliveryId, submissionId });
        },
        onQueued: () => {
          if (!current() || delivery.queued) return;
          delivery.queued = true;
          this.#emit({ type: "submission-queued", deliveryId, answer });
          if (this.#activeEpoch !== null) this.#notice("queued", delivery);
        },
        onTurnComplete: ({ messages, outcome }) => {
          if (!current()) return;
          if (outcome !== "completed") {
            this.#stopDelivery(delivery, outcome);
            return;
          }
          const ownedMessages = messages.filter(({ id }) =>
            delivery.messageIds.has(id),
          );
          if (
            ownedMessages.some(({ parts }) =>
              parts.some(
                (part) => part.type === "text" && part.state === "streaming",
              ),
            )
          ) {
            this.#stopDelivery(delivery, "withheld");
            return;
          }
          // Copy canonical strings now, before the panel admits the next turn.
          delivery.completedResponse = selectCanonicalSpeech(ownedMessages);
          delivery.speechCancelled ||= this.#activeEpoch === null;
          this.#complete(delivery);
        },
      });
      if (!delivery.queued && this.#activeEpoch !== null)
        this.#notice("received", delivery);
      const result = await pending;
      if (!current()) return;
      if (
        result.kind !== "message" ||
        result.messageId !== deliveryId ||
        (result.submissionId !== undefined &&
          delivery.submissionId !== undefined &&
          result.submissionId !== delivery.submissionId)
      ) {
        failCorrelation();
        return;
      }
      if (
        delivery.submissionId === undefined &&
        result.submissionId !== undefined
      ) {
        delivery.submissionId = result.submissionId;
        delivery.settlements.set(result.submissionId, undefined);
      }
      delivery.accepted = true;
      this.#emit({ type: "submission-accepted", deliveryId, answer });
      this.#complete(delivery);
    } catch (error) {
      if (!current()) return;
      this.#deliveries.delete(deliveryId);
      if (error instanceof FlueChatAdmissionError) {
        this.#emit({
          type: "error",
          code: admissionErrorCode(error.failure),
          failure: error.failure,
          message: error.message,
        });
      } else {
        this.#emit({
          type: "error",
          code: "interview-submission",
          message:
            "The interview could not accept that answer. Use the composer to recover.",
        });
      }
    }
  }

  #complete(delivery: Delivery): void {
    if (
      !delivery.accepted ||
      delivery.submissionId === undefined ||
      delivery.completedResponse === undefined
    )
      return;
    if (
      [...delivery.settlements.values()].some(
        (outcome) => outcome !== "completed",
      )
    )
      return;
    const { segments, questionSegment } = delivery.completedResponse;
    if (segments.length === 0) {
      this.#stopDelivery(delivery, "withheld");
      return;
    }
    this.#deliveries.delete(delivery.deliveryId);
    this.#emit({ type: "submission-settled", deliveryId: delivery.deliveryId });
    delivery.speechCancelled ||= this.#activeEpoch === null;
    this.#emit({
      type: "canonical-response-ready",
      deliveryId: delivery.deliveryId,
      segments,
      ...(questionSegment ? { questionSegment } : {}),
      ...(delivery.speechCancelled ? { speechCancelled: true } : {}),
    });
    if (!delivery.speechCancelled) {
      try {
        this.#session.speakParaphrase(segments, {
          deliveryId: delivery.deliveryId,
          ...(questionSegment ? { questionSegment } : {}),
        });
      } catch {
        this.#emit({
          type: "error",
          code: "interview-response",
          message:
            "The complete response is on screen, but Voice could not deliver it.",
        });
      }
    }
  }
}
