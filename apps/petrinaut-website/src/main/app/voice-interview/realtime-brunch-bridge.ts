import {
  hashCanonicalSpeechText,
  type CanonicalSpeechSegment,
  type InterviewSpeechSource,
} from "./canonical-speech";

import type {
  InterviewSpeechPreparationRequest,
  InterviewSpeechPreparationResult,
  OpenAIRealtimeSessionEvent,
} from "./openai-realtime-session";

type ChatStatus = "ready" | "submitted" | "streaming" | "error";

interface ChatUpdate {
  readonly automaticSource?: InterviewSpeechSource | null;
  readonly canAcceptInterviewAnswer: boolean;
  readonly canonicalSegments: CanonicalSpeechSegment[];
  readonly status: ChatStatus;
}

interface RealtimeBridgeSession {
  completeFunctionCall(callId: string, responseText: readonly string[]): void;
  prepareInterviewSpeech(
    request: InterviewSpeechPreparationRequest,
  ): Promise<InterviewSpeechPreparationResult>;
  speakCanonical(segments: CanonicalSpeechSegment[]): void;
  speakPrepared(responseText: readonly string[]): void;
  subscribe(listener: (event: OpenAIRealtimeSessionEvent) => void): () => void;
}

interface SubmitInterviewAnswerInput {
  readonly id: string;
  readonly text: string;
}

type SubmitInterviewAnswerResult =
  | { readonly kind: "interactive-tool"; readonly toolCallId: string }
  | { readonly kind: "message"; readonly messageId: string };

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
  correlated: boolean;
  sawBusyChatStatus: boolean;
}

interface ArgumentStream {
  readonly chunks: string[];
  readonly itemId: string;
  readonly responseId: string;
}

type SpeechDelivery =
  | { readonly kind: "automatic" }
  | { readonly callId: string; readonly kind: "function-call" };

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
      readonly segments: CanonicalSpeechSegment[];
      readonly type: "canonical-response-ready";
    }
  | {
      readonly code: RealtimeBridgeErrorCode;
      readonly message: string;
      readonly type: "error";
    }
  | {
      readonly type: "speech-delivery-pending";
    };

export interface PreparedInterviewSpeech {
  readonly mode: "realtime-processed" | "canonical-fallback";
  readonly sourceSegmentIds: readonly string[];
  readonly text: readonly string[];
}

export const assemblePreparedInterviewSpeech = ({
  preparation,
  source,
}: {
  preparation: InterviewSpeechPreparationResult;
  source: InterviewSpeechSource;
}): PreparedInterviewSpeech => {
  if (preparation.kind === "prepared") {
    return {
      mode: "realtime-processed",
      sourceSegmentIds: [
        ...preparation.sourceSegmentIds,
        ...(source.questionSegment ? [source.questionSegment.id] : []),
      ],
      text: [
        ...(preparation.context ? [preparation.context] : []),
        ...(source.questionSegment ? [source.questionSegment.text] : []),
      ],
    };
  }

  return {
    mode: "canonical-fallback",
    sourceSegmentIds: source.fullResponseSegments.map(({ id }) => id),
    text: source.fullResponseSegments.map(({ text }) => text),
  };
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

const spokenWordCount = (text: string): number => {
  const trimmedText = text.trim();
  return trimmedText ? trimmedText.split(/\s+/u).length : 0;
};

const preparationCacheKey = (
  source: InterviewSpeechSource,
  contextWordBudget: number,
): string => {
  const sourceIdentity = JSON.stringify([
    ...source.contextSegments.map(({ contentHash, id }) => [id, contentHash]),
    contextWordBudget,
  ]);
  return `speech-preparation:${hashCanonicalSpeechText(sourceIdentity)}`;
};

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
  readonly #preparedContextCache = new Map<string, string>();
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
    if (this.#activeEpoch !== connectionEpoch) {
      this.#preparedContextCache.clear();
    }
    this.#activeEpoch = connectionEpoch;
    this.#activeSubmission = null;
    this.#argumentDeltas.clear();
    this.#processedCalls.clear();
    this.#seenSegmentIds.clear();
    this.#terminalResponseIds.clear();
    for (const segment of this.#chat.canonicalSegments) {
      this.#seenSegmentIds.add(segment.id);
    }

    const source = this.#chat.automaticSource;
    if (source) {
      this.#prepareAndDeliver(source, { kind: "automatic" });
    } else {
      const question = latestPendingQuestion(this.#chat.canonicalSegments);
      if (!question) {
        return;
      }
      const currentTurnSegments = this.#chat.canonicalSegments.filter(
        ({ messageId }) => messageId === question.messageId,
      );
      this.#session.speakCanonical(currentTurnSegments);
    }
  }

  public stop(): void {
    ++this.#generation;
    this.#activeEpoch = null;
    this.#activeSubmission = null;
    this.#argumentDeltas.clear();
    this.#preparedContextCache.clear();
    this.#terminalResponseIds.clear();
  }

  public cancelPendingSpeech(): void {
    ++this.#generation;
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
      for (const segment of newSegments) {
        this.#seenSegmentIds.add(segment.id);
      }
      const source = update.automaticSource;
      if (source && this.#sourceMatchesSegments(source, newSegments)) {
        this.#prepareAndDeliver(source, { kind: "automatic" });
      } else {
        this.#session.speakCanonical(newSegments);
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
      sawBusyChatStatus: false,
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
      const result = await this.#submitInterviewAnswer({
        id: createRealtimeSubmissionId(event.connectionEpoch, event.callId),
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
    const responseSegments = this.#chat.canonicalSegments.filter(
      ({ id }) => !active.baselineSegmentIds.has(id),
    );
    if (responseSegments.length === 0) {
      return;
    }

    for (const segment of responseSegments) {
      this.#seenSegmentIds.add(segment.id);
    }
    this.#activeSubmission = null;
    const source = this.#chat.automaticSource;
    if (source && this.#sourceMatchesSegments(source, responseSegments)) {
      this.#prepareAndDeliver(source, {
        callId: active.callId,
        kind: "function-call",
      });
    } else {
      try {
        this.#session.completeFunctionCall(
          active.callId,
          responseSegments.map(({ text }) => text),
        );
      } catch {
        this.#fail(INVALID_BRIDGE_EVENT);
        return;
      }
    }
    this.#emit({
      callId: active.callId,
      segments: responseSegments,
      type: "canonical-response-ready",
    });
  }

  #sourceMatchesSegments(
    source: InterviewSpeechSource,
    segments: readonly CanonicalSpeechSegment[],
  ): boolean {
    return (
      source.fullResponseSegments.length === segments.length &&
      source.fullResponseSegments.every(
        ({ id }, index) => segments[index]?.id === id,
      )
    );
  }

  #prepareAndDeliver(
    source: InterviewSpeechSource,
    delivery: SpeechDelivery,
  ): void {
    this.#emit({ type: "speech-delivery-pending" });
    const generation = this.#generation;
    const questionWordCount = source.questionSegment
      ? spokenWordCount(source.questionSegment.text)
      : 0;
    const contextWordBudget = Math.max(0, 50 - questionWordCount);

    if (source.contextSegments.length === 0 || contextWordBudget === 0) {
      const questionOnlySource: InterviewSpeechSource = {
        ...source,
        contextSegments: [],
        fullResponseSegments: source.questionSegment
          ? [source.questionSegment]
          : [],
      };
      this.#deliverPreparedSpeech(
        assemblePreparedInterviewSpeech({
          preparation: {
            context: "",
            kind: "prepared",
            sourceSegmentIds: [],
          },
          source: questionOnlySource,
        }).text,
        delivery,
      );
      return;
    }

    const request: InterviewSpeechPreparationRequest = {
      cacheKey: preparationCacheKey(source, contextWordBudget),
      contextText: source.contextSegments.map(({ text }) => text),
      contextWordBudget,
      sourceSegmentIds: source.contextSegments.map(({ id }) => id),
    };
    const cachedContext = this.#preparedContextCache.get(request.cacheKey);
    if (cachedContext !== undefined) {
      this.#deliverPreparedSpeech(
        assemblePreparedInterviewSpeech({
          preparation: {
            context: cachedContext,
            kind: "prepared",
            sourceSegmentIds: request.sourceSegmentIds,
          },
          source,
        }).text,
        delivery,
      );
      return;
    }
    void this.#session.prepareInterviewSpeech(request).then((preparation) => {
      if (generation !== this.#generation) {
        return;
      }
      if (preparation.kind === "prepared") {
        this.#preparedContextCache.set(request.cacheKey, preparation.context);
      }
      this.#deliverPreparedSpeech(
        assemblePreparedInterviewSpeech({ preparation, source }).text,
        delivery,
      );
    });
  }

  #deliverPreparedSpeech(
    responseText: readonly string[],
    delivery: SpeechDelivery,
  ): void {
    try {
      if (delivery.kind === "function-call") {
        this.#session.completeFunctionCall(delivery.callId, responseText);
      } else {
        this.#session.speakPrepared(responseText);
      }
    } catch {
      this.#fail(INVALID_BRIDGE_EVENT);
    }
  }
}
