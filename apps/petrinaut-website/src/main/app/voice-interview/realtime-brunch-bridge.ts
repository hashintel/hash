import {
  hashCanonicalSpeechText,
  type CanonicalSpeechSegment,
  type InterviewSpeechSource,
} from "./canonical-speech";

import type {
  InterviewSpeechPreparationRequest,
  InterviewSpeechPreparationResult,
  OpenAIRealtimeSessionEvent,
  OpenAIRealtimeTranscriptKey,
} from "./openai-realtime-session";

type ChatStatus = "ready" | "submitted" | "streaming" | "error";

interface ChatUpdate {
  readonly automaticSource?: InterviewSpeechSource | null;
  readonly canAcceptInterviewAnswer: boolean;
  readonly canonicalSegments: CanonicalSpeechSegment[];
  readonly status: ChatStatus;
}

interface RealtimeBridgeSession {
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
  readonly epoch: number;
  readonly pendingQuestionId: string | null;
  readonly transcriptId: string;
  correlated: boolean;
  sawBusyChatStatus: boolean;
}

export type RealtimeBridgeErrorCode =
  | "interview-correlation"
  | "interview-response"
  | "interview-submission";

/**
 * Why a completed user transcript was not submitted to Brunch.
 *
 * - `empty`: the transcript contained no words (silence or noise).
 * - `failed`: Realtime reported that transcription of the audio failed.
 * - `duplicate`: this item and content index were already handled.
 * - `unavailable`: an answer is already in flight or Brunch cannot accept
 *   input right now.
 * - `too-long`: the transcript exceeds the interview answer limit.
 */
export type RealtimeTranscriptRejectionReason =
  | "duplicate"
  | "empty"
  | "failed"
  | "too-long"
  | "unavailable";

export type RealtimeBrunchBridgeEvent =
  | {
      readonly answer: string;
      readonly type: "submission-started";
    }
  | {
      readonly answer: string;
      readonly type: "submission-accepted";
    }
  | {
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
    }
  | {
      readonly reason: RealtimeTranscriptRejectionReason;
      readonly type: "transcript-rejected";
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

const transcriptIdentity = ({
  connectionEpoch,
  contentIndex,
  itemId,
}: OpenAIRealtimeTranscriptKey): string =>
  `${connectionEpoch}:${encodeURIComponent(itemId)}:${contentIndex}`;

/**
 * Stable submission ID for one completed user transcript, derived from the
 * connection epoch, Realtime item ID, and content index. The bridge submits
 * each identity at most once, and downstream consumers can de-duplicate on it.
 */
export const createRealtimeSubmissionId = (
  key: OpenAIRealtimeTranscriptKey,
): string => `voice-realtime:${transcriptIdentity(key)}`;

const normalizeTranscript = (text: string): string =>
  text.trim().replace(/\s+/gu, " ");

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

/**
 * Connects the Realtime session to the Brunch interview.
 *
 * Inbound: the completed `gpt-4o-transcribe` transcript of the user's audio is
 * the only source of user answers. Realtime never generates a response of its
 * own between turns, so nothing the model infers can become a user message.
 * Each transcript identity (connection epoch, item ID, content index) is
 * submitted at most once; empty, failed, stale, duplicate, or ill-timed
 * transcripts are dropped and reported through `transcript-rejected`.
 *
 * Outbound: Brunch responses are spoken through the prepared-speech path
 * (concise context plus the exact canonical question) or verbatim canonical
 * speech, both of which are out-of-band Realtime responses without tools.
 */
export class RealtimeBrunchBridge {
  readonly #listeners = new Set<BridgeListener>();
  readonly #preparedContextCache = new Map<string, string>();
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
  #cancelledSpeechSource: InterviewSpeechSource | null = null;
  #generation = 0;
  #pendingSpeechSource: InterviewSpeechSource | null = null;
  #speechGeneration = 0;

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
      this.#processedTranscripts.clear();
    }
    this.#activeEpoch = connectionEpoch;
    this.#activeSubmission = null;
    this.#cancelledSpeechSource = null;
    this.#pendingSpeechSource = null;
    this.#seenSegmentIds.clear();
    for (const segment of this.#chat.canonicalSegments) {
      this.#seenSegmentIds.add(segment.id);
    }

    const source = this.#chat.automaticSource;
    if (source) {
      this.#prepareAndDeliver(source);
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
    this.#cancelledSpeechSource = null;
    this.#pendingSpeechSource = null;
    this.#preparedContextCache.clear();
  }

  public cancelPendingSpeech(): void {
    ++this.#speechGeneration;
    if (this.#pendingSpeechSource) {
      this.#cancelledSpeechSource = this.#pendingSpeechSource;
      this.#pendingSpeechSource = null;
    }
  }

  public restoreCancelledSpeech(): void {
    const source = this.#cancelledSpeechSource;
    if (!source || this.#activeEpoch === null) {
      return;
    }
    this.#cancelledSpeechSource = null;
    this.#prepareAndDeliver(source);
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
        this.#prepareAndDeliver(source);
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
    this.#cancelledSpeechSource = null;
    this.#pendingSpeechSource = null;
    this.#emit({ code, message, type: "error" });
  }

  #handleSessionEvent(event: OpenAIRealtimeSessionEvent): void {
    // Only completed user transcripts and transcription failures can affect the
    // interview. Everything else (including any unexpected legacy tool events)
    // is ignored, so model-generated content can never become a user answer.
    if (event.type !== "completed" && event.type !== "transcription-failed") {
      return;
    }
    if (event.key.connectionEpoch !== this.#activeEpoch) {
      return;
    }
    const transcriptId = transcriptIdentity(event.key);
    if (this.#processedTranscripts.has(transcriptId)) {
      this.#emit({ reason: "duplicate", type: "transcript-rejected" });
      return;
    }
    this.#processedTranscripts.add(transcriptId);
    const question = latestPendingQuestion(this.#chat.canonicalSegments);
    if (
      this.#activeSubmission ||
      !this.#chat.canAcceptInterviewAnswer ||
      (!question && this.#chat.status !== "ready")
    ) {
      this.#emit({ reason: "unavailable", type: "transcript-rejected" });
      return;
    }
    if (event.type === "transcription-failed") {
      this.#emit({ reason: "failed", type: "transcript-rejected" });
      return;
    }

    const answer = normalizeTranscript(event.text);
    if (!answer) {
      this.#emit({ reason: "empty", type: "transcript-rejected" });
      return;
    }
    if (Array.from(answer).length > ANSWER_LIMIT) {
      this.#emit({ reason: "too-long", type: "transcript-rejected" });
      return;
    }

    const generation = this.#generation;
    this.#cancelledSpeechSource = null;
    this.#activeSubmission = {
      baselineSegmentIds: new Set(
        this.#chat.canonicalSegments.map(({ id }) => id),
      ),
      correlated: false,
      epoch: event.key.connectionEpoch,
      pendingQuestionId: question?.partId ?? null,
      sawBusyChatStatus: false,
      transcriptId,
    };
    this.#emit({ answer, type: "submission-started" });
    void this.#submit(event.key, transcriptId, answer, generation);
  }

  async #submit(
    key: OpenAIRealtimeTranscriptKey,
    transcriptId: string,
    answer: string,
    generation: number,
  ): Promise<void> {
    try {
      const result = await this.#submitInterviewAnswer({
        id: createRealtimeSubmissionId(key),
        text: answer,
      });
      const active = this.#activeSubmission;
      if (
        generation !== this.#generation ||
        !active ||
        active.transcriptId !== transcriptId ||
        active.epoch !== key.connectionEpoch
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
      this.#emit({ answer, type: "submission-accepted" });
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
      this.#prepareAndDeliver(source);
    } else {
      try {
        this.#session.speakCanonical(responseSegments);
      } catch {
        this.#fail(INVALID_BRIDGE_EVENT);
        return;
      }
    }
    this.#emit({
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

  #prepareAndDeliver(source: InterviewSpeechSource): void {
    const generation = this.#generation;
    const speechGeneration = this.#speechGeneration;
    this.#cancelledSpeechSource = null;
    this.#pendingSpeechSource = source;
    this.#emit({ type: "speech-delivery-pending" });
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
      );
      this.#pendingSpeechSource = null;
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
      );
      this.#pendingSpeechSource = null;
      return;
    }
    void this.#session.prepareInterviewSpeech(request).then((preparation) => {
      if (generation !== this.#generation) {
        return;
      }
      const preparedSpeech = assemblePreparedInterviewSpeech({
        preparation,
        source,
      });
      if (speechGeneration !== this.#speechGeneration) {
        // Speech was cancelled (new input, pause, or replay) while preparing;
        // the caller owns the next utterance.
        return;
      }
      this.#pendingSpeechSource = null;
      if (preparation.kind === "prepared") {
        this.#preparedContextCache.set(request.cacheKey, preparation.context);
      }
      this.#deliverPreparedSpeech(preparedSpeech.text);
    });
  }

  #deliverPreparedSpeech(responseText: readonly string[]): void {
    try {
      this.#session.speakPrepared(responseText);
    } catch {
      this.#fail(INVALID_BRIDGE_EVENT);
    }
  }
}
