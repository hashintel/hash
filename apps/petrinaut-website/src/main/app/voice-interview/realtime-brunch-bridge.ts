import type { CanonicalSpeechSegment } from "./canonical-speech";
import type {
  OpenAIRealtimeSessionEvent,
  OpenAIRealtimeTranscriptKey,
} from "./openai-realtime-session";
import type { AgentSendResult, FlueConversationSettlement } from "@flue/sdk";
import type { FlueChatTransportOptions } from "@hashintel/brunch-agent-transport-aisdk";
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
  /** Flue's settlement index: the only witness that a turn ended short of a reply. */
  readonly settlements?: readonly VoiceSubmissionSettlement[];
  readonly status: PetrinautAiVoiceModeContext["status"];
}

interface RealtimeBridgeSession {
  speakCanonical(segments: CanonicalSpeechSegment[]): void;
  subscribe(listener: (event: OpenAIRealtimeSessionEvent) => void): () => void;
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

type SubmitInterviewAnswerInput = Pick<SubmitVoiceInput, "text"> & {
  readonly admissionTarget: RealtimeBrunchAdmissionTarget;
  readonly id: string;
  readonly onAdmission: (submissionId: AgentSendResult["submissionId"]) => void;
  readonly signal: AbortSignal;
};

type SubmitInterviewAnswerResult =
  | Extract<PetrinautAiComposerSubmitTextResult, { kind: "interactive-tool" }>
  | (Extract<PetrinautAiComposerSubmitTextResult, { kind: "message" }> & {
      readonly submissionId?: AgentSendResult["submissionId"];
    });

interface RealtimeBrunchBridgeDependencies {
  readonly session: RealtimeBridgeSession;
  readonly submitInterviewAnswer: (
    input: SubmitInterviewAnswerInput,
  ) => Promise<SubmitInterviewAnswerResult>;
}

interface ActiveSubmission {
  readonly abortController: AbortController;
  readonly baselineSegmentIds: ReadonlySet<string>;
  readonly deliveryId: string;
  correlated: boolean;
  firstTextEmitted: boolean;
  sawBusyChatStatus: boolean;
  speechCancelled: boolean;
  submissionId: AgentSendResult["submissionId"] | null;
}

export type RealtimeBridgeErrorCode =
  | "interview-correlation"
  | "interview-response"
  | "interview-submission";

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
      readonly deliveryId: string;
      readonly submissionId: AgentSendResult["submissionId"];
      readonly type: "submission-admitted";
    }
  | {
      readonly deliveryId: string;
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
      readonly outcome: Exclude<
        VoiceSubmissionSettlement["outcome"],
        "completed"
      >;
      readonly type: "submission-stopped";
    }
  | {
      readonly reason: RealtimeTranscriptRejectionReason;
      readonly type: "transcript-rejected";
    }
  | {
      readonly code: RealtimeBridgeErrorCode;
      readonly message: string;
      readonly type: "error";
    };

type BridgeListener = (event: RealtimeBrunchBridgeEvent) => void;

const INVALID_BRIDGE_EVENT =
  "The voice response could not be matched to the interview. Reconnect voice or use text instead.";
const ANSWER_LIMIT = 32_000;

export const createRealtimeSubmissionId = ({
  connectionEpoch,
  contentIndex,
  itemId,
}: OpenAIRealtimeTranscriptKey): string =>
  `voice-realtime:${connectionEpoch}:${encodeURIComponent(itemId)}:${contentIndex}`;

const transcriptKeyId = (key: OpenAIRealtimeTranscriptKey): string =>
  createRealtimeSubmissionId(key);

const normalizeTranscript = (transcript: string): string =>
  transcript.trim().replace(/\s+/gu, " ");

export class RealtimeBrunchBridge {
  readonly #listeners = new Set<BridgeListener>();
  readonly #processedTranscripts = new Set<string>();
  readonly #session: RealtimeBridgeSession;
  readonly #submitInterviewAnswer: (
    input: SubmitInterviewAnswerInput,
  ) => Promise<SubmitInterviewAnswerResult>;
  readonly #seenSegmentIds = new Set<string>();
  #activeEpoch: number | null = null;
  #activeSubmission: ActiveSubmission | null = null;
  #chat: ChatUpdate = {
    canAcceptInterviewAnswer: false,
    canonicalSegments: [],
    status: "ready",
  };
  #generation = 0;

  public constructor({
    session,
    submitInterviewAnswer,
  }: RealtimeBrunchBridgeDependencies) {
    this.#session = session;
    this.#submitInterviewAnswer = submitInterviewAnswer;
    session.subscribe((event) => this.#handleSessionEvent(event));
  }

  public subscribe(listener: BridgeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public cancelPendingSpeech(): void {
    if (this.#activeSubmission) {
      this.#activeSubmission.speechCancelled = true;
    }
  }

  public start(connectionEpoch: number): void {
    ++this.#generation;
    this.#activeSubmission?.abortController.abort();
    this.#activeEpoch = connectionEpoch;
    this.#activeSubmission = null;
    this.#processedTranscripts.clear();
    this.#seenSegmentIds.clear();
    for (const segment of this.#chat.canonicalSegments) {
      this.#seenSegmentIds.add(segment.id);
    }
  }

  public stop(): void {
    ++this.#generation;
    this.#activeSubmission?.abortController.abort();
    this.#activeEpoch = null;
    this.#activeSubmission = null;
    this.#processedTranscripts.clear();
  }

  public updateChat(update: ChatUpdate): void {
    this.#chat = update;
    if (this.#activeEpoch === null) {
      return;
    }
    if (update.status === "error") {
      this.#fail(
        "The interview could not complete that turn. Use the composer to retry.",
        "interview-response",
      );
      return;
    }
    if (this.#activeSubmission) {
      if (update.status === "submitted" || update.status === "streaming") {
        this.#activeSubmission.sawBusyChatStatus = true;
      }
      this.#completeCorrelatedSubmission();
      return;
    }
    if (update.status !== "ready") {
      return;
    }

    const newSegments = update.canonicalSegments.filter(
      ({ id }) => !this.#seenSegmentIds.has(id),
    );
    if (newSegments.length === 0) {
      return;
    }
    try {
      this.#session.speakCanonical(newSegments);
      for (const segment of newSegments) {
        this.#seenSegmentIds.add(segment.id);
      }
    } catch {
      this.#fail(INVALID_BRIDGE_EVENT);
    }
  }

  #emit(event: RealtimeBrunchBridgeEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #rejectTranscript(reason: RealtimeTranscriptRejectionReason): void {
    this.#emit({ reason, type: "transcript-rejected" });
  }

  #fail(
    message: string,
    code: RealtimeBridgeErrorCode = "interview-correlation",
  ): void {
    ++this.#generation;
    this.#activeSubmission?.abortController.abort();
    this.#activeSubmission = null;
    this.#emit({ code, message, type: "error" });
  }

  #handleSessionEvent(event: OpenAIRealtimeSessionEvent): void {
    if (event.type !== "completed" && event.type !== "transcription-failed") {
      return;
    }
    if (event.key.connectionEpoch !== this.#activeEpoch) {
      return;
    }

    const keyId = transcriptKeyId(event.key);
    if (this.#processedTranscripts.has(keyId)) {
      this.#rejectTranscript("duplicate");
      return;
    }
    this.#processedTranscripts.add(keyId);

    if (event.type === "transcription-failed") {
      this.#rejectTranscript("failed");
      return;
    }
    if (
      this.#activeSubmission ||
      !this.#chat.canAcceptInterviewAnswer ||
      this.#chat.status !== "ready"
    ) {
      this.#rejectTranscript("unavailable");
      return;
    }

    const answer = normalizeTranscript(event.text);
    if (answer.length === 0) {
      this.#rejectTranscript("empty");
      return;
    }
    if (Array.from(answer).length > ANSWER_LIMIT) {
      this.#rejectTranscript("over-limit");
      return;
    }

    const deliveryId = createRealtimeSubmissionId(event.key);
    const generation = this.#generation;
    this.#activeSubmission = {
      abortController: new AbortController(),
      baselineSegmentIds: new Set(
        this.#chat.canonicalSegments.map(({ id }) => id),
      ),
      correlated: false,
      deliveryId,
      firstTextEmitted: false,
      sawBusyChatStatus: false,
      speechCancelled: false,
      submissionId: null,
    };
    this.#emit({ answer, deliveryId, type: "submission-started" });
    void this.#submit(answer, deliveryId, generation);
  }

  async #submit(
    answer: string,
    deliveryId: string,
    generation: number,
  ): Promise<void> {
    try {
      const activeAtSubmission = this.#activeSubmission;
      if (!activeAtSubmission) return;
      const result = await this.#submitInterviewAnswer({
        admissionTarget: { kind: "user", messageId: deliveryId },
        id: deliveryId,
        onAdmission: (submissionId) => {
          const active = this.#activeSubmission;
          if (
            generation !== this.#generation ||
            !active ||
            active.deliveryId !== deliveryId
          ) {
            return;
          }
          if (active.submissionId !== null) {
            if (active.submissionId !== submissionId) {
              this.#fail(INVALID_BRIDGE_EVENT);
            }
            return;
          }
          active.submissionId = submissionId;
          this.#emit({
            deliveryId,
            submissionId,
            type: "submission-admitted",
          });
        },
        signal: activeAtSubmission.abortController.signal,
        text: answer,
      });
      const active = this.#activeSubmission;
      if (
        generation !== this.#generation ||
        !active ||
        active.deliveryId !== deliveryId
      ) {
        return;
      }
      if (result.kind !== "message" || result.messageId !== deliveryId) {
        this.#fail(INVALID_BRIDGE_EVENT);
        return;
      }
      const resultSubmissionId = result.submissionId ?? null;
      if (
        active.submissionId !== null &&
        resultSubmissionId !== null &&
        active.submissionId !== resultSubmissionId
      ) {
        this.#fail(INVALID_BRIDGE_EVENT);
        return;
      }
      active.submissionId ??= resultSubmissionId;
      active.correlated = true;
      this.#emit({ answer, deliveryId, type: "submission-accepted" });
      this.#completeCorrelatedSubmission();
    } catch {
      if (generation === this.#generation) {
        this.#fail(
          "The interview could not accept that answer. Use the composer to retry.",
          "interview-submission",
        );
      }
    }
  }

  #completeCorrelatedSubmission(): void {
    const active = this.#activeSubmission;
    if (!active?.correlated || !active.sawBusyChatStatus) {
      return;
    }
    // A reply may be written by the admitted submission itself or by a
    // client-tool continuation projected onto the same message, and an ask
    // follow-up writes into the message that asked; so match membership and
    // exclude only what was already there when this answer was submitted.
    const responseSegments = this.#chat.canonicalSegments.filter(
      (segment) =>
        !active.baselineSegmentIds.has(segment.id) &&
        (active.submissionId === null ||
          (segment.submissionIds?.includes(active.submissionId) ?? false)),
    );
    if (responseSegments.length > 0 && !active.firstTextEmitted) {
      // Completed canonical text can land while the turn is still streaming;
      // record that instant separately from settlement.
      active.firstTextEmitted = true;
      this.#emit({
        deliveryId: active.deliveryId,
        type: "canonical-text-ready",
      });
    }
    if (this.#chat.status !== "ready") {
      return;
    }
    if (responseSegments.length === 0) {
      this.#completeStoppedSubmission(active);
      return;
    }

    this.#emit({
      deliveryId: active.deliveryId,
      type: "submission-settled",
    });
    if (!active.speechCancelled) {
      try {
        this.#session.speakCanonical(responseSegments);
      } catch {
        this.#fail(INVALID_BRIDGE_EVENT);
        return;
      }
    }
    for (const segment of responseSegments) {
      this.#seenSegmentIds.add(segment.id);
    }
    this.#activeSubmission = null;
    this.#emit({
      deliveryId: active.deliveryId,
      segments: responseSegments,
      ...(active.speechCancelled ? { speechCancelled: true as const } : {}),
      type: "canonical-response-ready",
    });
  }

  /**
   * A turn that settled short of a reply leaves no canonical text behind. Only
   * Flue's settlement index distinguishes it from a turn still in progress or
   * a completed step whose client-tool follow-up the panel is about to send,
   * so wait for that record and never treat silence alone as a stop.
   */
  #completeStoppedSubmission(active: ActiveSubmission): void {
    if (active.submissionId === null) return;
    const settlement = this.#chat.settlements?.find(
      ({ submissionId }) => submissionId === active.submissionId,
    );
    if (settlement === undefined || settlement.outcome === "completed") {
      return;
    }
    this.#emit({
      deliveryId: active.deliveryId,
      type: "submission-settled",
    });
    this.#activeSubmission = null;
    this.#emit({
      deliveryId: active.deliveryId,
      outcome: settlement.outcome,
      type: "submission-stopped",
    });
  }
}
