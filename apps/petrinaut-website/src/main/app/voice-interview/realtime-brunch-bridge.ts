import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { OpenAIRealtimeSessionEvent } from "./openai-realtime-session";
import type { AgentSendResult } from "@flue/sdk";
import type { FlueChatTransportOptions } from "@hashintel/brunch-agent-transport-aisdk";
import type {
  PetrinautAiComposerSubmitTextResult,
  PetrinautAiVoiceModeContext,
} from "@hashintel/petrinaut/ui";

interface ChatUpdate {
  readonly canAcceptInterviewAnswer: boolean;
  readonly canonicalSegments: CanonicalSpeechSegment[];
  readonly status: PetrinautAiVoiceModeContext["status"];
}

interface RealtimeBridgeSession {
  completeFunctionCall(
    callId: string,
    segments: CanonicalSpeechSegment[],
  ): void;
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
  readonly baselineSegmentIds: ReadonlySet<string>;
  readonly callId: string;
  readonly epoch: number;
  readonly pendingQuestionId: string | null;
  readonly pendingQuestionMessageId: string | null;
  correlated: boolean;
  sawBusyChatStatus: boolean;
  submissionId: AgentSendResult["submissionId"] | null;
}

interface ArgumentStream {
  readonly chunks: string[];
  readonly itemId: string;
  readonly responseId: string;
}

export type RealtimeBridgeErrorCode =
  | "interview-correlation"
  | "interview-response"
  | "interview-submission";

export type RealtimeBrunchBridgeEvent =
  | {
      readonly answer: string;
      readonly callId: string;
      readonly type: "submission-started";
    }
  | {
      readonly answer: string;
      readonly callId: string;
      readonly type: "submission-accepted";
    }
  | {
      readonly callId: string;
      readonly submissionId: AgentSendResult["submissionId"];
      readonly type: "submission-admitted";
    }
  | {
      readonly callId: string;
      readonly segments: CanonicalSpeechSegment[];
      readonly type: "canonical-response-ready";
    }
  | {
      readonly callId: string;
      readonly type: "canonical-text-ready";
    }
  | {
      readonly callId: string;
      readonly type: "submission-settled";
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

export const createRealtimeSubmissionId = (
  connectionEpoch: number,
  callId: string,
): string => `voice-realtime:${connectionEpoch}:${encodeURIComponent(callId)}`;

const latestPendingQuestion = (
  segments: CanonicalSpeechSegment[],
): CanonicalSpeechSegment | undefined =>
  segments.findLast(({ source }) => source === "brunch-ask");

const parseContinueInterviewArguments = (
  argumentsJson: string,
): string | null => {
  try {
    const value: unknown = JSON.parse(argumentsJson);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 1 || typeof record.answer !== "string") {
      return null;
    }
    const answer = record.answer.trim();
    return answer && Array.from(answer).length <= ANSWER_LIMIT ? answer : null;
  } catch {
    return null;
  }
};

export class RealtimeBrunchBridge {
  readonly #argumentDeltas = new Map<string, ArgumentStream>();
  readonly #listeners = new Set<BridgeListener>();
  readonly #processedCalls = new Set<string>();
  readonly #session: RealtimeBridgeSession;
  readonly #submitInterviewAnswer: (
    input: SubmitInterviewAnswerInput,
  ) => Promise<SubmitInterviewAnswerResult>;
  readonly #seenSegmentIds = new Set<string>();
  readonly #terminalResponseIds = new Set<string>();
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

  public start(connectionEpoch: number): void {
    ++this.#generation;
    this.#activeEpoch = connectionEpoch;
    this.#activeSubmission = null;
    this.#argumentDeltas.clear();
    this.#processedCalls.clear();
    this.#seenSegmentIds.clear();
    this.#terminalResponseIds.clear();
    for (const segment of this.#chat.canonicalSegments) {
      this.#seenSegmentIds.add(segment.id);
    }

    const question = latestPendingQuestion(this.#chat.canonicalSegments);
    if (question) {
      this.#session.speakCanonical(
        this.#chat.canonicalSegments.filter(
          ({ messageId }) => messageId === question.messageId,
        ),
      );
    }
  }

  public stop(): void {
    ++this.#generation;
    this.#activeEpoch = null;
    this.#activeSubmission = null;
    this.#argumentDeltas.clear();
    this.#terminalResponseIds.clear();
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

  #fail(
    message: string,
    code: RealtimeBridgeErrorCode = "interview-correlation",
  ): void {
    ++this.#generation;
    this.#activeSubmission = null;
    this.#argumentDeltas.clear();
    this.#emit({ code, message, type: "error" });
  }

  #handleSessionEvent(event: OpenAIRealtimeSessionEvent): void {
    if (
      !("connectionEpoch" in event) ||
      event.connectionEpoch !== this.#activeEpoch
    ) {
      return;
    }
    if (event.type === "response-terminal") {
      this.#handleResponseTerminal(event);
      return;
    }
    if (
      event.type !== "tool-arguments-delta" &&
      event.type !== "tool-arguments-done"
    ) {
      return;
    }

    const responseKey = `${event.connectionEpoch}:${event.responseId}`;
    if (this.#terminalResponseIds.has(responseKey)) {
      return;
    }
    const callKey = `${event.connectionEpoch}:${event.callId}`;
    if (this.#processedCalls.has(callKey)) {
      return;
    }
    if (event.type === "tool-arguments-delta") {
      const stream = this.#argumentDeltas.get(callKey);
      if (!stream && this.#argumentDeltas.size > 0) {
        this.#processedCalls.add(callKey);
        this.#fail(INVALID_BRIDGE_EVENT);
        return;
      }
      if (
        stream &&
        (stream.itemId !== event.itemId ||
          stream.responseId !== event.responseId)
      ) {
        this.#processedCalls.add(callKey);
        this.#fail(INVALID_BRIDGE_EVENT);
        return;
      }
      if (stream) {
        stream.chunks.push(event.delta);
      } else {
        this.#argumentDeltas.set(callKey, {
          chunks: [event.delta],
          itemId: event.itemId,
          responseId: event.responseId,
        });
      }
      return;
    }

    this.#processedCalls.add(callKey);
    const stream = this.#argumentDeltas.get(callKey);
    if (!stream && this.#argumentDeltas.size > 0) {
      this.#fail(INVALID_BRIDGE_EVENT);
      return;
    }
    this.#argumentDeltas.delete(callKey);
    if (
      this.#activeSubmission ||
      event.name !== "continue_interview" ||
      (stream !== undefined &&
        (stream.itemId !== event.itemId ||
          stream.responseId !== event.responseId ||
          stream.chunks.join("") !== event.arguments))
    ) {
      this.#fail(INVALID_BRIDGE_EVENT);
      return;
    }

    const answer = parseContinueInterviewArguments(event.arguments);
    const question = latestPendingQuestion(this.#chat.canonicalSegments);
    if (
      !answer ||
      !this.#chat.canAcceptInterviewAnswer ||
      (!question && this.#chat.status !== "ready")
    ) {
      this.#fail(INVALID_BRIDGE_EVENT);
      return;
    }

    const generation = this.#generation;
    this.#activeSubmission = {
      baselineSegmentIds: new Set(
        this.#chat.canonicalSegments.map(({ id }) => id),
      ),
      callId: event.callId,
      correlated: false,
      epoch: event.connectionEpoch,
      pendingQuestionId: question?.partId ?? null,
      pendingQuestionMessageId: question?.messageId ?? null,
      sawBusyChatStatus: false,
      submissionId: null,
    };
    this.#emit({ answer, callId: event.callId, type: "submission-started" });
    void this.#submit(event, answer, generation);
  }

  #handleResponseTerminal(
    event: Extract<OpenAIRealtimeSessionEvent, { type: "response-terminal" }>,
  ): void {
    const responseKey = `${event.connectionEpoch}:${event.responseId}`;
    const matchingStreams = [...this.#argumentDeltas].filter(
      ([, stream]) => stream.responseId === event.responseId,
    );
    if (event.status === "completed" && matchingStreams.length > 0) {
      this.#fail(INVALID_BRIDGE_EVENT);
      return;
    }

    for (const [callKey] of matchingStreams) {
      this.#argumentDeltas.delete(callKey);
      this.#processedCalls.add(callKey);
    }
    this.#terminalResponseIds.add(responseKey);
  }

  async #submit(
    event: Extract<OpenAIRealtimeSessionEvent, { type: "tool-arguments-done" }>,
    answer: string,
    generation: number,
  ): Promise<void> {
    try {
      const activeAtSubmission = this.#activeSubmission;
      if (!activeAtSubmission) return;
      const voiceMessageId = createRealtimeSubmissionId(
        event.connectionEpoch,
        event.callId,
      );
      const result = await this.#submitInterviewAnswer({
        admissionTarget:
          activeAtSubmission.pendingQuestionMessageId === null
            ? { kind: "user", messageId: voiceMessageId }
            : {
                kind: "client-tool-result",
                messageId: activeAtSubmission.pendingQuestionMessageId,
              },
        id: voiceMessageId,
        onAdmission: (submissionId) => {
          const active = this.#activeSubmission;
          if (
            generation !== this.#generation ||
            !active ||
            active.callId !== event.callId ||
            active.epoch !== event.connectionEpoch
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
            callId: event.callId,
            submissionId,
            type: "submission-admitted",
          });
        },
        text: answer,
      });
      const active = this.#activeSubmission;
      if (
        generation !== this.#generation ||
        !active ||
        active.callId !== event.callId ||
        active.epoch !== event.connectionEpoch
      ) {
        return;
      }
      const resultMatchesSubmission =
        active.pendingQuestionId === null
          ? result.kind === "message"
          : result.kind === "interactive-tool" &&
            result.toolCallId === active.pendingQuestionId;
      if (!resultMatchesSubmission) {
        this.#fail(INVALID_BRIDGE_EVENT);
        return;
      }
      const resultSubmissionId =
        result.kind === "message" ? (result.submissionId ?? null) : null;
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
      this.#emit({
        answer,
        callId: event.callId,
        type: "submission-accepted",
      });
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
    if (
      !active?.correlated ||
      !active.sawBusyChatStatus ||
      this.#chat.status !== "ready"
    ) {
      return;
    }
    const responseSegments = this.#chat.canonicalSegments.filter((segment) =>
      active.submissionId === null
        ? !active.baselineSegmentIds.has(segment.id)
        : segment.submissionId === active.submissionId,
    );
    if (responseSegments.length === 0) {
      return;
    }

    this.#emit({ callId: active.callId, type: "canonical-text-ready" });
    this.#emit({ callId: active.callId, type: "submission-settled" });
    try {
      this.#session.completeFunctionCall(active.callId, responseSegments);
    } catch {
      this.#fail(INVALID_BRIDGE_EVENT);
      return;
    }
    for (const segment of responseSegments) {
      this.#seenSegmentIds.add(segment.id);
    }
    this.#activeSubmission = null;
    this.#emit({
      callId: active.callId,
      segments: responseSegments,
      type: "canonical-response-ready",
    });
  }
}
