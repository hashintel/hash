import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";

import {
  createVoiceRequestId,
  reportVoiceDiagnostic,
  voiceDurationMs,
  type VoiceDiagnosticReporter,
} from "../../../voice-diagnostics";
import { classifyInterruption } from "./realtime-brunch-bridge/classify-interruption";

import type { CanonicalSpeechSegment } from "./canonical-speech";
import type {
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

export interface CancelPendingSpeechOptions {
  readonly discardPendingInterruption?: boolean;
}

interface ChatUpdate {
  readonly canAcceptInterviewAnswer: boolean;
  readonly canonicalSegments: CanonicalSpeechSegment[];
  readonly questionSegment?: CanonicalSpeechSegment;
  /** Local logical termination when the panel withheld a continuation. */
  readonly stopped?: boolean;
  /** Flue's settlement index remains the durable outcome authority. */
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
  readonly reportDiagnostic?: VoiceDiagnosticReporter;
  readonly session: RealtimeBridgeSession;
  readonly submitInterviewAnswer: (
    input: SubmitInterviewAnswerInput,
  ) => Promise<SubmitInterviewAnswerResult>;
}

interface CompletedResponseMessage extends FlueChatResponseMessageCompletedEvent {
  consumed: boolean;
}

type TerminalTranscriptEvent =
  | {
      readonly key: OpenAIRealtimeTranscriptKey;
      readonly text: string;
      readonly type: "completed";
    }
  | {
      readonly key: OpenAIRealtimeTranscriptKey;
      readonly type: "transcription-failed";
    };

interface PendingInputItem {
  readonly ordinaryAcceptedWhileReady: boolean;
  stopped: boolean;
}

interface ActiveSubmission {
  readonly abortController: AbortController;
  readonly baselineSegmentIds: ReadonlySet<string>;
  readonly completedResponseMessages: CompletedResponseMessage[];
  readonly deliveryId: string;
  correlated: boolean;
  firstTextEmitted: boolean;
  sawBusyChatStatus: boolean;
  speechCancelled: boolean;
  submissionId: AgentSendResult["submissionId"] | null;
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
  | "pending"
  | "prompt-regurgitation"
  | "self-echo"
  | "unavailable";

export type RealtimeBrunchBridgeEvent =
  | { readonly answer: string; readonly type: "transcript-retained" }
  | {
      readonly answer: string;
      readonly deliveryId: string;
      readonly itemId: string;
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
      readonly itemId: string;
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

const positionPrecedes = (
  first: FlueChatResponseMessageCompletedEvent["position"],
  second: FlueChatResponseMessageStartedEvent["position"],
): boolean =>
  first.batch < second.batch ||
  (first.batch === second.batch && first.index < second.index);

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

export class RealtimeBrunchBridge {
  readonly #acceptedInputItemIds = new Set<string>();
  readonly #activePlaybackText = new Map<string, readonly string[]>();
  readonly #completedInputEvents = new Map<string, TerminalTranscriptEvent>();
  readonly #inputItemOrder: string[] = [];
  readonly #listeners = new Set<BridgeListener>();
  readonly #pendingInputItems = new Map<string, PendingInputItem>();
  readonly #pendingSpeechRequestIds = new Set<string>();
  readonly #playbackOverlappingInputItemIds = new Set<string>();
  readonly #processedTranscripts = new Set<string>();
  readonly #reportDiagnostic: VoiceDiagnosticReporter;
  readonly #session: RealtimeBridgeSession;
  readonly #submitInterviewAnswer: (
    input: SubmitInterviewAnswerInput,
  ) => Promise<SubmitInterviewAnswerResult>;
  readonly #seenSegmentIds = new Set<string>();
  // null preserves enabled-mode admission without classifying ordinary capture.
  readonly #interruptionPlaybackText = new Map<
    string,
    readonly string[] | null
  >();
  #pendingInterruption: {
    answer: string;
    deliveryId: string;
    itemId: string;
  } | null = null;
  #activeEpoch: number | null = null;
  #activeSubmission: ActiveSubmission | null = null;
  #chat: ChatUpdate = {
    canAcceptInterviewAnswer: false,
    canonicalSegments: [],
    status: "ready",
  };
  #generation = 0;
  #outputCancellationPending = false;

  public constructor({
    reportDiagnostic = reportVoiceDiagnostic,
    session,
    submitInterviewAnswer,
  }: RealtimeBrunchBridgeDependencies) {
    this.#reportDiagnostic = reportDiagnostic;
    this.#session = session;
    this.#submitInterviewAnswer = submitInterviewAnswer;
    session.subscribe((event) => this.#handleSessionEvent(event));
  }

  public subscribe(listener: BridgeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public cancelPendingSpeech({
    discardPendingInterruption = false,
  }: CancelPendingSpeechOptions = {}): void {
    this.#outputCancellationPending = true;
    this.#interruptionPlaybackText.clear();
    this.#retirePendingInputItems();
    for (const responseId of this.#activePlaybackText.keys()) {
      this.#activePlaybackText.set(responseId, []);
    }
    if (discardPendingInterruption) {
      this.#pendingInterruption = null;
    }
    if (this.#activeSubmission) {
      this.#activeSubmission.speechCancelled = true;
    }
  }

  public completeTurnHandoff(): void {
    this.#activePlaybackText.clear();
    this.#outputCancellationPending = false;
    this.#pendingSpeechRequestIds.clear();
    this.#drainPendingInterruption();
  }

  public notifyResponseMessageCompleted(
    event: FlueChatResponseMessageCompletedEvent,
  ): void {
    const active = this.#activeSubmission;
    if (
      active === null ||
      active.completedResponseMessages.some(
        ({ position }) =>
          position.batch === event.position.batch &&
          position.index === event.position.index,
      )
    ) {
      return;
    }
    active.completedResponseMessages.push({
      ...event,
      consumed: false,
    });
    this.#completeCorrelatedSubmission();
  }

  public notifyResponseMessageStarted(
    event: FlueChatResponseMessageStartedEvent,
  ): void {
    const active = this.#activeSubmission;
    if (active === null) {
      return;
    }
    for (const completion of active.completedResponseMessages) {
      if (
        !completion.consumed &&
        completion.messageId === event.messageId &&
        positionPrecedes(completion.position, event.position)
      ) {
        completion.consumed = true;
      }
    }
  }

  public start(connectionEpoch: number): void {
    ++this.#generation;
    this.#activeSubmission?.abortController.abort();
    this.#activeEpoch = connectionEpoch;
    this.#activeSubmission = null;
    this.#acceptedInputItemIds.clear();
    this.#completedInputEvents.clear();
    this.#inputItemOrder.length = 0;
    this.#interruptionPlaybackText.clear();
    this.#pendingInputItems.clear();
    this.#pendingInterruption = null;
    this.#playbackOverlappingInputItemIds.clear();
    this.#processedTranscripts.clear();
    this.#activePlaybackText.clear();
    this.#outputCancellationPending = false;
    this.#pendingSpeechRequestIds.clear();
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
    this.#acceptedInputItemIds.clear();
    this.#completedInputEvents.clear();
    this.#inputItemOrder.length = 0;
    this.#interruptionPlaybackText.clear();
    this.#pendingInputItems.clear();
    this.#pendingInterruption = null;
    this.#playbackOverlappingInputItemIds.clear();
    this.#processedTranscripts.clear();
    this.#activePlaybackText.clear();
    this.#outputCancellationPending = false;
    this.#pendingSpeechRequestIds.clear();
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
    if (this.#outputCancellationPending || update.stopped) {
      for (const segment of update.canonicalSegments) {
        this.#seenSegmentIds.add(segment.id);
      }
    }
    if (this.#outputCancellationPending) {
      return;
    }
    if (this.#drainPendingInterruption()) return;
    if (update.stopped || update.status !== "ready") return;

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

  #rejectTranscript(
    itemId: string,
    reason: RealtimeTranscriptRejectionReason,
  ): void {
    this.#emit({ itemId, reason, type: "transcript-rejected" });
  }

  #fail(
    message: string,
    code: RealtimeInterviewErrorCode = "interview-correlation",
  ): void {
    ++this.#generation;
    this.#activeSubmission?.abortController.abort();
    this.#activeSubmission = null;
    this.#pendingInterruption = null;
    this.#interruptionPlaybackText.clear();
    this.#activePlaybackText.clear();
    this.#emit({ code, message, type: "error" });
  }

  #failAdmission(error: FlueChatAdmissionError): void {
    ++this.#generation;
    this.#activeSubmission?.abortController.abort();
    this.#activeSubmission = null;
    this.#pendingInterruption = null;
    this.#interruptionPlaybackText.clear();
    this.#activePlaybackText.clear();
    this.#emit({
      code: admissionErrorCode(error.failure),
      failure: error.failure,
      message: error.message,
      type: "error",
    });
  }

  #handleSessionEvent(event: OpenAIRealtimeSessionEvent): void {
    if (
      "connectionEpoch" in event &&
      event.connectionEpoch !== this.#activeEpoch
    ) {
      return;
    }
    if (event.type === "input-speech-started") {
      if (event.interruptionBySpeaking) {
        // The session has already sent output cancellation. Snapshot only text
        // whose playback started, not queued speech or canonical chat history.
        if (!this.#interruptionPlaybackText.has(event.itemId)) {
          this.#interruptionPlaybackText.set(
            event.itemId,
            this.#ownsOutputTurn()
              ? Array.from(this.#activePlaybackText.values()).flat()
              : null,
          );
        }
        if (this.#activeSubmission) {
          this.#activeSubmission.speechCancelled = true;
        }
      }
      if (!event.interruptionBySpeaking && this.#ownsOutputTurn()) {
        this.#playbackOverlappingInputItemIds.add(event.itemId);
      } else {
        this.#acceptedInputItemIds.add(event.itemId);
        if (!this.#pendingInputItems.has(event.itemId)) {
          this.#pendingInputItems.set(event.itemId, {
            ordinaryAcceptedWhileReady:
              !event.interruptionBySpeaking && this.#canSubmitAnswerNow(),
            stopped: false,
          });
          this.#inputItemOrder.push(event.itemId);
        }
      }
      return;
    }
    if (event.type === "input-speech-stopped") {
      const pendingInput = this.#pendingInputItems.get(event.itemId);
      if (this.#acceptedInputItemIds.has(event.itemId) && pendingInput) {
        pendingInput.stopped = true;
      }
      return;
    }
    if (event.type === "canonical-speech-requested") {
      this.#pendingSpeechRequestIds.add(event.speechRequestId);
      this.#markPlaybackOverlappingInputItems();
      return;
    }
    if (event.type === "output-started") {
      this.#pendingSpeechRequestIds.delete(event.speechRequestId);
      this.#activePlaybackText.set(event.responseId, event.canonicalText ?? []);
      this.#markPlaybackOverlappingInputItems();
      return;
    }
    if (
      event.type === "output-stopped" ||
      event.type === "output-interrupted"
    ) {
      if (
        event.type === "output-interrupted" &&
        event.speechRequestId !== undefined
      ) {
        this.#pendingSpeechRequestIds.delete(event.speechRequestId);
      }
      this.#activePlaybackText.delete(event.responseId);
      return;
    }
    if (event.type === "response-terminal") {
      if (
        event.speechRequestId !== undefined &&
        (event.status !== "completed" || !event.playbackExpected)
      ) {
        this.#pendingSpeechRequestIds.delete(event.speechRequestId);
      }
      return;
    }
    if (event.type !== "completed" && event.type !== "transcription-failed") {
      return;
    }
    if (event.key.connectionEpoch !== this.#activeEpoch) {
      return;
    }
    const terminalEvent: TerminalTranscriptEvent =
      event.type === "transcription-failed"
        ? { key: event.key, type: "transcription-failed" }
        : { key: event.key, text: event.text, type: "completed" };

    const keyId = transcriptKeyId(event.key);
    if (this.#processedTranscripts.has(keyId)) {
      this.#rejectTranscript(event.key.itemId, "duplicate");
      return;
    }
    this.#processedTranscripts.add(keyId);
    if (this.#pendingInputItems.has(event.key.itemId)) {
      this.#completedInputEvents.set(event.key.itemId, terminalEvent);
      this.#drainCompletedInputEvents();
      return;
    }
    this.#processCompletedInputEvent(terminalEvent);
  }

  #drainCompletedInputEvents(): void {
    let itemId = this.#inputItemOrder.at(0);
    let event =
      itemId === undefined ? undefined : this.#completedInputEvents.get(itemId);
    while (itemId !== undefined && event !== undefined) {
      this.#inputItemOrder.shift();
      this.#completedInputEvents.delete(itemId);
      this.#processCompletedInputEvent(event);
      itemId = this.#inputItemOrder.at(0);
      event =
        itemId === undefined
          ? undefined
          : this.#completedInputEvents.get(itemId);
    }
  }

  #processCompletedInputEvent(event: TerminalTranscriptEvent): void {
    this.#acceptedInputItemIds.delete(event.key.itemId);
    const ordinaryInputWasAcceptedWhileReady = Boolean(
      this.#pendingInputItems.get(event.key.itemId)?.ordinaryAcceptedWhileReady,
    );
    this.#pendingInputItems.delete(event.key.itemId);
    const interruptionPlaybackText = this.#interruptionPlaybackText.get(
      event.key.itemId,
    );
    this.#interruptionPlaybackText.delete(event.key.itemId);

    if (this.#playbackOverlappingInputItemIds.has(event.key.itemId)) {
      this.#rejectTranscript(event.key.itemId, "unavailable");
      return;
    }

    if (event.type === "transcription-failed") {
      this.#rejectTranscript(event.key.itemId, "failed");
      return;
    }

    // An interruption, or ordinary speech that finished while admission was
    // open, waits for an earlier spoken answer rather than losing speech-order
    // authority to asynchronous transcription completion.
    if (
      interruptionPlaybackText === undefined &&
      !ordinaryInputWasAcceptedWhileReady &&
      !this.#canSubmitAnswerNow()
    ) {
      this.#rejectTranscript(event.key.itemId, "unavailable");
      return;
    }

    const answer = normalizeTranscript(event.text);
    if (answer.length === 0) {
      this.#rejectTranscript(event.key.itemId, "empty");
      return;
    }
    if (Array.from(answer).length > ANSWER_LIMIT) {
      this.#rejectTranscript(event.key.itemId, "over-limit");
      return;
    }

    if (
      interruptionPlaybackText !== undefined &&
      interruptionPlaybackText !== null
    ) {
      const startedAt = performance.now();
      const rejectionReason = classifyInterruption(
        answer,
        interruptionPlaybackText,
      );
      if (rejectionReason !== null) {
        this.#reportDiagnostic({
          durationMs: voiceDurationMs(startedAt, performance.now()),
          operation: "transcription",
          outcome: "rejected",
          rejectionReason,
          requestId: createVoiceRequestId(),
          stage: "browser",
        });
        this.#rejectTranscript(event.key.itemId, rejectionReason);
        return;
      }
    }

    const deliveryId = createRealtimeSubmissionId(event.key);
    if (this.#pendingInterruption) {
      this.#rejectTranscript(event.key.itemId, "pending");
      return;
    }
    if (!this.#canSubmitAnswerNow()) {
      this.#pendingInterruption = {
        answer,
        deliveryId,
        itemId: event.key.itemId,
      };
      this.#emit({ answer, type: "transcript-retained" });
      return;
    }
    this.#submitAnswer(answer, deliveryId, event.key.itemId);
  }

  #ordinaryInputFinishedWhileReady(itemId: string): boolean {
    const pendingInput = this.#pendingInputItems.get(itemId);
    return Boolean(
      pendingInput?.ordinaryAcceptedWhileReady &&
      (pendingInput.stopped || this.#completedInputEvents.has(itemId)),
    );
  }

  #retirePendingInputItems(): void {
    for (const itemId of this.#pendingInputItems.keys()) {
      this.#acceptedInputItemIds.delete(itemId);
      this.#playbackOverlappingInputItemIds.add(itemId);
      if (this.#completedInputEvents.has(itemId)) {
        this.#rejectTranscript(itemId, "unavailable");
      }
    }
    this.#completedInputEvents.clear();
    this.#inputItemOrder.length = 0;
    this.#pendingInputItems.clear();
  }

  #markPlaybackOverlappingInputItems(): void {
    for (const itemId of this.#acceptedInputItemIds) {
      if (
        this.#interruptionPlaybackText.has(itemId) ||
        this.#ordinaryInputFinishedWhileReady(itemId)
      ) {
        continue;
      }
      this.#playbackOverlappingInputItemIds.add(itemId);
      this.#acceptedInputItemIds.delete(itemId);
      this.#pendingInputItems.delete(itemId);
      const orderIndex = this.#inputItemOrder.indexOf(itemId);
      if (orderIndex >= 0) {
        this.#inputItemOrder.splice(orderIndex, 1);
      }
      if (this.#completedInputEvents.delete(itemId)) {
        this.#rejectTranscript(itemId, "unavailable");
      }
    }
    this.#drainCompletedInputEvents();
  }

  #canSubmitAnswerNow(): boolean {
    return (
      !this.#activeSubmission &&
      this.#chat.canAcceptInterviewAnswer &&
      this.#chat.status === "ready"
    );
  }

  #drainPendingInterruption(): boolean {
    const pending = this.#pendingInterruption;
    if (!pending) return false;
    if (
      this.#activeEpoch === null ||
      this.#outputCancellationPending ||
      !this.#canSubmitAnswerNow()
    ) {
      return true;
    }
    this.#pendingInterruption = null;
    this.#submitAnswer(pending.answer, pending.deliveryId, pending.itemId);
    return true;
  }

  #submitAnswer(answer: string, deliveryId: string, itemId: string): void {
    const generation = this.#generation;
    this.#activeSubmission = {
      abortController: new AbortController(),
      baselineSegmentIds: new Set(
        this.#chat.canonicalSegments.map(({ id }) => id),
      ),
      completedResponseMessages: [],
      correlated: false,
      deliveryId,
      firstTextEmitted: false,
      sawBusyChatStatus: false,
      speechCancelled: false,
      submissionId: null,
    };
    this.#emit({ answer, deliveryId, itemId, type: "submission-started" });
    void this.#submit(answer, deliveryId, generation);
  }

  #ownsOutputTurn(): boolean {
    return (
      this.#activePlaybackText.size > 0 ||
      this.#pendingSpeechRequestIds.size > 0
    );
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
    } catch (error) {
      if (generation === this.#generation) {
        if (error instanceof FlueChatAdmissionError) {
          this.#failAdmission(error);
        } else {
          this.#fail(
            "The interview could not accept that answer. Use the composer to retry.",
            "interview-submission",
          );
        }
      }
    }
  }

  #completeCorrelatedSubmission(): void {
    const active = this.#activeSubmission;
    if (!active?.correlated || !active.sawBusyChatStatus) {
      return;
    }
    if (this.#chat.stopped && this.#chat.status === "ready") {
      // Cancellation can finish before this step commits its final prose.
      // Retire it now so a later render cannot restart the withheld speech.
      for (const segment of this.#chat.canonicalSegments) {
        this.#seenSegmentIds.add(segment.id);
      }
      const settlement = this.#chat.settlements?.find(
        ({ submissionId }) => submissionId === active.submissionId,
      );
      this.#emit({ deliveryId: active.deliveryId, type: "submission-settled" });
      this.#activeSubmission = null;
      this.#emit({
        deliveryId: active.deliveryId,
        outcome:
          settlement && settlement.outcome !== "completed"
            ? settlement.outcome
            : "withheld",
        type: "submission-stopped",
      });
      this.#drainPendingInterruption();
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
    const stoppedSettlement =
      active.submissionId === null
        ? undefined
        : this.#chat.settlements?.find(
            ({ submissionId }) => submissionId === active.submissionId,
          );
    if (stoppedSettlement && stoppedSettlement.outcome !== "completed") {
      if (this.#chat.status === "ready") {
        this.#completeStoppedSubmission(active);
      }
      return;
    }
    const completionMatchesSegment = (
      completion: CompletedResponseMessage,
      segment: CanonicalSpeechSegment,
    ): boolean =>
      completion.messageId === segment.messageId &&
      (segment.submissionIds?.includes(completion.submissionId) ?? false);
    const pendingCompletions = active.completedResponseMessages.filter(
      ({ consumed }) => !consumed,
    );
    const eligibleCompletions = pendingCompletions.filter((completion) =>
      responseSegments.some(
        (segment) =>
          !this.#seenSegmentIds.has(segment.id) &&
          completionMatchesSegment(completion, segment),
      ),
    );
    const completedSegments = responseSegments.filter(
      (segment) =>
        !this.#seenSegmentIds.has(segment.id) &&
        eligibleCompletions.some((completion) =>
          completionMatchesSegment(completion, segment),
        ),
    );
    if (!active.speechCancelled) {
      if (completedSegments.length > 0) {
        try {
          this.#session.speakCanonical(completedSegments);
          for (const segment of completedSegments) {
            this.#seenSegmentIds.add(segment.id);
          }
        } catch {
          this.#fail(INVALID_BRIDGE_EVENT);
          return;
        }
      }
    }
    for (const completion of eligibleCompletions) {
      completion.consumed = true;
    }
    if (this.#chat.status !== "ready") {
      return;
    }
    if (responseSegments.length === 0) {
      if (stoppedSettlement?.outcome === "completed") {
        this.#emit({
          deliveryId: active.deliveryId,
          type: "submission-settled",
        });
        this.#activeSubmission = null;
        this.#emit({
          deliveryId: active.deliveryId,
          segments: [],
          type: "canonical-response-ready",
        });
      }
      return;
    }

    this.#emit({
      deliveryId: active.deliveryId,
      type: "submission-settled",
    });
    if (!active.speechCancelled) {
      const unscheduledSegments = responseSegments.filter(
        ({ id }) => !this.#seenSegmentIds.has(id),
      );
      if (unscheduledSegments.length > 0) {
        try {
          this.#session.speakCanonical(unscheduledSegments);
        } catch {
          this.#fail(INVALID_BRIDGE_EVENT);
          return;
        }
      }
    }
    for (const segment of responseSegments) {
      this.#seenSegmentIds.add(segment.id);
    }
    const questionSegment = this.#chat.questionSegment;
    const correlatedQuestion =
      questionSegment &&
      responseSegments.some(
        ({ messageId }) => messageId === questionSegment.messageId,
      ) &&
      (active.submissionId === null ||
        (questionSegment.submissionIds?.includes(active.submissionId) ?? false))
        ? questionSegment
        : undefined;
    this.#activeSubmission = null;
    this.#emit({
      deliveryId: active.deliveryId,
      ...(correlatedQuestion ? { questionSegment: correlatedQuestion } : {}),
      segments: responseSegments,
      ...(active.speechCancelled ? { speechCancelled: true as const } : {}),
      type: "canonical-response-ready",
    });
    this.#drainPendingInterruption();
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
    this.#drainPendingInterruption();
  }
}
