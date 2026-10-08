import { getToolName, isToolUIPart } from "ai";

import { maxUtteranceTextLength } from "../../../../../shared/live-utterance-judgment";
import { serializeVoiceBrief } from "../../../../../shared/voice-mediation";
import { logLiveDiagnostic } from "../shared/live-diagnostic";
import { selectCanonicalSpeech } from "./canonical-speech";
import { ProgressPolicy } from "./live-brunch-bridge/progress-policy";
import {
  liveUtteranceStages,
  routeUtterance,
} from "./live-brunch-bridge/utterance-pipeline";

import type {
  UtteranceJudgment,
  UtteranceJudgmentState,
} from "../../../../../shared/live-utterance-judgment";
import type { VoiceBriefFields } from "../../../../../shared/voice-mediation";
import type { VoiceMediationHistory } from "../history/voice-mediation-history";
import type {
  RealtimeBrunchBridge,
  VoiceSubmissionSettlement,
} from "../realtime/realtime-brunch-bridge";
import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { SkipReason } from "./live-brunch-bridge/utterance-pipeline";
import type { FinalizedInput } from "./live-conversation";
import type { FlueConversationState } from "@flue/sdk";
import type {
  FlueChatResponseMessageCompletedEvent,
  FlueChatResponseMessageStartedEvent,
} from "@hashintel/brunch-agent-transport-aisdk";
import type {
  PetrinautAiMessage,
  PetrinautAiVoiceModeContext,
} from "@hashintel/petrinaut/ui";

interface Chat {
  readonly canAcceptVoiceInput: boolean;
  readonly segments: readonly CanonicalSpeechSegment[];
  /** Visible text, including streaming/stopped parts, for quiet interruption context only. */
  readonly messages?: readonly PetrinautAiMessage[];
  readonly settlements: readonly VoiceSubmissionSettlement[];
  readonly snapshot?: FlueConversationState;
  readonly status: PetrinautAiVoiceModeContext["status"];
  readonly stopped?: boolean;
}

interface Turn {
  readonly inputId: string;
  readonly inputText: string;
  readonly superseded?: boolean;
  readonly preparation: AbortController;
  readonly baseline: ReadonlySet<string>;
  readonly baselineMessages: ReadonlySet<string>;
  delegationId: string | null;
  readonly progress: ProgressPolicy;
  progressOffered: boolean;
  submitted?: boolean;
  submissionId?: string;
  /** The conversation history the turn began in, so a switch cannot split it. */
  readonly history: VoiceMediationHistory;
}

type Submit = ConstructorParameters<
  typeof RealtimeBrunchBridge
>[0]["submitInterviewAnswer"];

/**
 * Leaked Live audio is skipped before a delegation is claimed: GPT-Live can
 * delegate its own echo, and an unclaimed delegation can outlast the utterance
 * it was created for. Other skips claim the delegation and decline it.
 */
const delegationOnSkip: Readonly<Record<SkipReason, "decline" | "leave">> = {
  // Shadow stages never skip, so these apply once the stage is switched on.
  echo: "leave",
  "doubtful-short-during-output": "leave",
  "short-during-output": "leave",
  empty: "decline",
};

interface Dependencies {
  readonly submit: Submit;
  readonly mediation: {
    readonly history: VoiceMediationHistory;
    readonly prepare: (
      text: string,
      signal: AbortSignal,
    ) => Promise<VoiceBriefFields>;
    readonly summarize: (text: string, signal: AbortSignal) => Promise<string>;
    readonly offered: (inputId: string) => void;
  };
  readonly appendCommentary: (
    text: string,
    delegationId: string | null,
  ) => boolean;
  /** A spoken-only progress line, outside any delegation. */
  readonly appendProgress: (text: string) => boolean;
  readonly appendInstructions: (text: string, delegationId: string) => boolean;
  /** Quiet progress/interruption context, never spoken or bound to a delegation. */
  readonly appendThinking: (text: string, delegationId: null) => boolean;
  readonly notice: (message: string | null) => void;
  /** Transcription speech has started and its transcript isn't finalized yet. */
  readonly speechPending: () => boolean;
  /**
   * Browser approval authority. Without a verdict, input-available means
   * executing; a refused call stays input-available until its output arrives.
   */
  readonly toolApprovalState?: (toolCallId: string) => ToolApprovalState | null;
  /** Optional log-only observation. Never controls submission or admission. */
  readonly judge?: (
    state: UtteranceJudgmentState,
    signal: AbortSignal,
  ) => Promise<UtteranceJudgment | null>;
}

export type ToolApprovalState = "awaiting" | "refused";

/** GPT-Live accepts at most 500 tokens per append; stay well inside it. */
const liveAppendCharacterBudget = 1_400;

const tail = (text: string, limit: number): string =>
  text.length <= limit ? text : `…${text.slice(-(limit - 1))}`;

const clipLiveAppend = (text: string): string =>
  text.length <= liveAppendCharacterBudget
    ? text
    : `${text.slice(0, liveAppendCharacterBudget - 1).trimEnd()}…`;

const speakingAgainInstruction =
  "The person started speaking again. Do not answer the earlier request; listen to them.";

const summaryStoppedInstruction =
  "The person stopped the response before its spoken summary. Do not summarize or read the written answer; it is in the conversation. Wait for the person.";

/** Session-local correlation only. Flue and the composer retain all canonical ownership. */
export class LiveBrunchBridge {
  readonly #dependencies: Dependencies;
  readonly #abort = new AbortController();
  readonly #seenInputs = new Set<string>();
  readonly #offeredSegments = new Set<string>();
  readonly #turns = new Set<Turn>();
  /** Settled turns whose spoken summary is still being prepared. */
  readonly #summarizing = new Set<Turn>();
  readonly #preparations = new Set<AbortController>();
  readonly #unclaimedDelegations = new Set<string>();
  readonly #deferredDelegations = new Set<string>();
  readonly #responses = new Map<
    string,
    Map<
      string,
      {
        completed: boolean;
        position: FlueChatResponseMessageStartedEvent["position"];
      }
    >
  >();
  #waitingForComposer: Turn | undefined;
  #lastOfferedText: string | null = null;
  #progressTimer: ReturnType<typeof setInterval> | undefined;
  #liveSpeaking = false;
  #progressPendingUntil = 0;
  #liveSpeechHoldUntil = 0;
  #chat: Chat = {
    canAcceptVoiceInput: false,
    segments: [],
    settlements: [],
    status: "ready",
  };

  public constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  /** Acoustic activity is a hold, not proof of provider playback completion. */
  public liveSpeaking(on: boolean): void {
    if (this.#liveSpeaking && !on) {
      // Live has no playback-complete event. Require sustained quiet rather
      // than releasing a pending summary at the first pause in a sentence.
      this.#liveSpeechHoldUntil = Date.now() + 1_500;
      for (const turn of this.#turns) {
        if (turn.delegationId !== null && !turn.progressOffered)
          turn.progress.acknowledged(Date.now());
      }
    }
    this.#liveSpeaking = on;
  }

  #liveAudioMayBePlaying(now: number): boolean {
    return (
      this.#liveSpeaking ||
      now < this.#progressPendingUntil ||
      now < this.#liveSpeechHoldUntil
    );
  }

  #stopProgress(): void {
    clearInterval(this.#progressTimer);
    this.#progressTimer = undefined;
  }

  #updateProgress(): void {
    if (this.#abort.signal.aborted || this.#turns.size === 0) {
      this.#stopProgress();
      return;
    }
    const now = Date.now();
    for (const turn of this.#turns) {
      if (turn.superseded || !turn.submissionId || turn.delegationId === null)
        continue;
      const { messages, required } = this.#responseScope(turn.submissionId);
      // Do not narrate a completed backend turn while its final rendering or
      // mediation catches up. Client continuations still have missing settlements.
      if (
        this.#chat.settlements.some(
          (entry) =>
            required.has(entry.submissionId) && entry.outcome !== "completed",
        ) ||
        [...required].every((id) =>
          this.#chat.settlements.some((entry) => entry.submissionId === id),
        )
      ) {
        continue;
      }
      for (const message of this.#chat.messages ?? []) {
        if (
          message.role !== "assistant" ||
          !messages.has(message.id) ||
          turn.baselineMessages.has(message.id)
        )
          continue;
        for (const part of message.parts) {
          if (!isToolUIPart(part)) continue;
          const approval =
            this.#dependencies.toolApprovalState?.(part.toolCallId) ?? null;
          const state =
            approval === "awaiting" || part.state === "approval-requested"
              ? "awaiting-approval"
              : part.state === "input-streaming"
                ? "preparing"
                : "running";
          turn.progress.toolStarted(
            part.toolCallId,
            getToolName(part),
            now,
            state,
          );
          if (approval === "refused") {
            turn.progress.toolFinished(part.toolCallId, now, false);
          } else if (
            part.state === "output-available" ||
            part.state === "output-error" ||
            part.state === "output-denied"
          ) {
            const output: unknown =
              part.state === "output-available" ? part.output : undefined;
            const failed =
              typeof output === "object" &&
              output !== null &&
              (("applied" in output && output.applied === false) ||
                ("success" in output && output.success === false) ||
                ("status" in output &&
                  ["invalid", "error", "cancelled", "failed"].includes(
                    String(output.status),
                  )));
            turn.progress.toolFinished(
              part.toolCallId,
              now,
              part.state === "output-available" && !failed,
            );
          }
        }
      }
      turn.progress.userSpeaking(this.#dependencies.speechPending());
      turn.progress.liveSpeaking(this.#liveAudioMayBePlaying(now));
      turn.progress.evaluate(now);
    }
  }

  public stop(): void {
    this.#closeDeferredDelegations();
    this.#abort.abort();
    this.speechStarted();
    this.#turns.clear();
    this.#unclaimedDelegations.clear();
  }

  /** Stop future speech offers, not work already admitted by Brunch. */
  public speechStarted(): void {
    this.#stopProgress();
    this.#progressPendingUntil = 0;
    for (const preparation of this.#preparations) preparation.abort();
    this.#preparations.clear();
    let withdrew = false;
    for (const turn of this.#turns) {
      if (!turn.submissionId) turn.history.failed(turn.inputId);
      // Words cancelled before submission stay sendable in the conversation
      // shown now, even after a switch; teardown withdraws them.
      if (!turn.submitted && !this.#abort.signal.aborted) {
        this.#dependencies.mediation.history.unsent(
          turn.inputId,
          turn.inputText,
          this.#chat.messages?.at(-1)?.id,
        );
        withdrew = true;
      }
      if (turn.delegationId !== null && !this.#abort.signal.aborted)
        this.#dependencies.appendInstructions(
          speakingAgainInstruction,
          turn.delegationId,
        );
    }
    this.#turns.clear();
    if (withdrew)
      this.#dependencies.notice(
        "Your earlier words weren’t sent. You started speaking again, so they’re in the composer if you still want them.",
      );
    for (const turn of this.#summarizing) {
      if (turn.delegationId !== null && !this.#abort.signal.aborted)
        this.#dependencies.appendInstructions(
          speakingAgainInstruction,
          turn.delegationId,
        );
    }
    this.#summarizing.clear();
    // The newest delegation may be for the speech that just started, and
    // transcription and Live report on separate connections.
    const newest = [...this.#unclaimedDelegations].at(-1);
    for (const delegationId of this.#unclaimedDelegations) {
      if (delegationId !== newest)
        this.#unserved(
          delegationId,
          "No request admission was confirmed for this delegation.",
        );
    }
    this.#unclaimedDelegations.clear();
    if (newest !== undefined) this.#unclaimedDelegations.add(newest);
    if (!this.#waitingForComposer?.submitted)
      this.#waitingForComposer = undefined;
  }

  /**
   * Submission follows the conversation shown now, so words prepared in
   * another one are not admitted here. Like words cancelled by speech, they
   * stay sendable in the conversation shown now.
   */
  #withdrawSwitched(turn: Turn): void {
    this.#turns.delete(turn);
    this.#preparations.delete(turn.preparation);
    turn.history.failed(turn.inputId);
    this.#dependencies.mediation.history.unsent(
      turn.inputId,
      turn.inputText,
      this.#chat.messages?.at(-1)?.id,
    );
    logLiveDiagnostic("brunch.conversation-switched", {
      inputId: turn.inputId,
      delegationId: turn.delegationId,
      submitted: false,
    });
    this.#dependencies.notice(
      "Your earlier words weren’t sent. The conversation changed, so they’re in the composer if you still want them.",
    );
    this.#unserved(
      turn.delegationId,
      "The request was not submitted because the conversation changed.",
    );
  }

  /** Settlement follows the conversation shown now, where a turn submitted elsewhere never settles. */
  #releaseSwitchedTurns(): void {
    const history = this.#dependencies.mediation.history;
    for (const turn of this.#turns) {
      if (!turn.submitted || turn.history === history) continue;
      this.#turns.delete(turn);
      this.#preparations.delete(turn.preparation);
      if (this.#waitingForComposer === turn)
        this.#waitingForComposer = undefined;
      logLiveDiagnostic("brunch.conversation-switched", {
        inputId: turn.inputId,
        submissionId: turn.submissionId,
        delegationId: turn.delegationId,
        submitted: true,
      });
      this.#unserved(
        turn.delegationId,
        "The conversation was switched before Brunch finished; its answer stays in the original conversation.",
      );
    }
  }

  /** Frees the composer from one stale turn; other turns and delegations stay. */
  #evict(turn: Turn): void {
    turn.preparation.abort();
    this.#preparations.delete(turn.preparation);
    if (!turn.submissionId) turn.history.failed(turn.inputId);
    this.#turns.delete(turn);
    if (this.#waitingForComposer === turn) this.#waitingForComposer = undefined;
  }

  public stopResponse(): void {
    if (this.#abort.signal.aborted) return;
    this.#chat = { ...this.#chat, stopped: true };
    this.#interruptTurns("stopped");
  }

  public acceptDelegation(delegationId: string): void {
    if (this.#abort.signal.aborted) return;
    const turn = [...this.#turns].findLast(
      (candidate) => !candidate.superseded && candidate.delegationId === null,
    );
    if (turn) {
      turn.delegationId = delegationId;
      // Live's prompt acknowledges before delegating. Receipt is a conservative
      // clock proxy; observed acknowledgement audio ending moves it later.
      turn.progress.acknowledged(Date.now());
      logLiveDiagnostic("delegation.matched", {
        delegationId,
        inputId: turn.inputId,
        submissionId: turn.submissionId,
      });
    } else if (this.#dependencies.speechPending()) {
      this.#unclaimedDelegations.add(delegationId);
      logLiveDiagnostic("delegation.unclaimed", { delegationId });
    } else {
      this.#deferredDelegations.add(delegationId);
      logLiveDiagnostic("delegation.deferred", {
        delegationId,
        reason: "speech-order-unknown",
      });
    }
  }

  /**
   * Unclaimed delegations were observed while transcription speech was pending.
   * Once none remains, a filter may have dropped the only speech that could
   * claim them, so holding them would shift later pairings.
   */
  #closeStrayDelegations(): void {
    if (this.#dependencies.speechPending()) return;
    for (const delegationId of this.#unclaimedDelegations)
      this.#closeDelegation(delegationId, "no-pending-speech");
    this.#unclaimedDelegations.clear();
  }

  /** Deferred delegations are never paired, so only Stop or teardown closes them. */
  #closeDeferredDelegations(): void {
    for (const delegationId of this.#deferredDelegations)
      this.#closeDelegation(delegationId, "deferred");
    this.#deferredDelegations.clear();
  }

  #closeDelegation(
    delegationId: string,
    reason: "no-pending-speech" | "deferred",
  ): void {
    logLiveDiagnostic("delegation.closed", { delegationId, reason });
    this.#dependencies.appendInstructions(
      "This request will not be answered. Do not respond to it; keep listening.",
      delegationId,
    );
  }

  #unserved(delegationId: string | null, status: string): void {
    if (delegationId === null || this.#abort.signal.aborted) return;
    this.#dependencies.appendInstructions(
      `${status} Explain the limitation briefly without asking the person to continue speaking. Do not claim work completed or was cancelled. Do not retry or replay automatically; check the conversation before any new attempt.`,
      delegationId,
    );
  }

  #unconfirmed(turn: Turn): void {
    this.#unserved(
      turn.delegationId,
      turn.submissionId
        ? "The request was admitted, but its response could not be confirmed."
        : turn.submitted
          ? "Request admission is unconfirmed; it may already have been accepted."
          : "The request was not submitted.",
    );
  }

  public async accept(input: FinalizedInput): Promise<void> {
    if (this.#abort.signal.aborted) return;
    if (this.#seenInputs.has(input.id)) {
      logLiveDiagnostic("input.ignored", {
        inputId: input.id,
        reason: "duplicate",
      });
      return;
    }
    this.#seenInputs.add(input.id);
    const skipReason = routeUtterance(input, liveUtteranceStages);
    if (skipReason !== null && delegationOnSkip[skipReason] === "leave") {
      logLiveDiagnostic("input.ignored", {
        inputId: input.id,
        reason: skipReason,
      });
      this.#closeStrayDelegations();
      return;
    }
    const delegationId = input.superseded
      ? null
      : ([...this.#unclaimedDelegations].at(-1) ?? null);
    if (delegationId !== null) this.#unclaimedDelegations.delete(delegationId);
    this.#closeStrayDelegations();
    if (skipReason !== null) {
      logLiveDiagnostic("input.ignored", {
        inputId: input.id,
        delegationId,
        reason: skipReason,
      });
      if (delegationId !== null) {
        this.#dependencies.appendInstructions(
          "No usable speech was captured for this turn. Ask the person to continue without assuming an answer.",
          delegationId,
        );
      }
      return;
    }
    if (!input.superseded && this.#waitingForComposer?.superseded)
      this.#evict(this.#waitingForComposer);
    if (
      input.text.length > maxUtteranceTextLength ||
      this.#waitingForComposer ||
      !this.#chat.canAcceptVoiceInput
    ) {
      logLiveDiagnostic("input.dropped", {
        inputId: input.id,
        delegationId,
        superseded: input.superseded === true,
        oversized: input.text.length > maxUtteranceTextLength,
        waitingForComposer: this.#waitingForComposer !== undefined,
        admissionUnavailable: !this.#chat.canAcceptVoiceInput,
      });
      // Newer speech already replaced these words; resending them is not asked for.
      if (input.superseded) return;
      this.#dependencies.notice(
        "Those words weren’t sent. They’re in the composer to send when the assistant is ready.",
      );
      const history = this.#dependencies.mediation.history;
      const waiting = this.#waitingForComposer;
      history.unsent(
        input.id,
        input.text,
        waiting && waiting.history === history
          ? waiting.inputId
          : this.#chat.messages?.at(-1)?.id,
      );
      this.#unserved(delegationId, "The request was not submitted.");
      return;
    }
    this.#dependencies.notice(null);
    const turn: Turn = {
      inputId: input.id,
      inputText: input.text,
      superseded: input.superseded,
      preparation: new AbortController(),
      delegationId,
      progressOffered: false,
      progress: new ProgressPolicy({
        commentary: (line) => {
          const sent = this.#dependencies.appendProgress(line);
          turn.progressOffered = true;
          // Allow output to begin before sending a simultaneously settled wrap-up.
          // A provider that stays silent must not block the summary indefinitely.
          if (sent) this.#progressPendingUntil = Date.now() + 5_000;
          return sent;
        },
        thinking: (context) => {
          this.#dependencies.appendThinking(JSON.stringify(context), null);
        },
        diagnostic: logLiveDiagnostic,
      }),
      history: this.#dependencies.mediation.history,
      baseline: new Set(this.#chat.segments.map((segment) => segment.id)),
      baselineMessages: new Set([
        ...this.#chat.segments.map((segment) => segment.messageId),
        ...(this.#chat.messages?.map((message) => message.id) ?? []),
        ...(this.#chat.snapshot?.messages.map((message) => message.id) ?? []),
      ]),
    };
    this.#waitingForComposer = turn;
    this.#turns.add(turn);
    turn.progress.startTurn(Date.now());
    if (delegationId !== null) turn.progress.acknowledged(Date.now());
    this.#progressTimer ??= setInterval(() => this.#updateProgress(), 250);
    this.#preparations.add(turn.preparation);
    // No await: a slow judge must not change the composer's admission window.
    const { judge } = this.#dependencies;
    if (judge) void this.#observeJudgment(judge, turn, input.text);
    try {
      let text = input.text;
      const mediation = this.#dependencies.mediation;
      turn.history.begin(input);
      try {
        const fields = await mediation.prepare(
          input.text,
          turn.preparation.signal,
        );
        turn.preparation.signal.throwIfAborted();
        turn.history.prepared(input.id, fields);
        text = serializeVoiceBrief(input.text, fields);
      } catch {
        turn.preparation.signal.throwIfAborted();
        logLiveDiagnostic("brief.unavailable", { inputId: input.id });
        turn.history.preparationFailed(input.id);
      }
      if (turn.history !== this.#dependencies.mediation.history) {
        this.#withdrawSwitched(turn);
        return;
      }
      logLiveDiagnostic("brunch.submit", { inputId: input.id, delegationId });
      turn.submitted = true;
      const result = await this.#dependencies.submit({
        id: input.id,
        text,
        admissionTarget: { kind: "user", messageId: input.id },
        signal: this.#abort.signal,
        onAdmission: (submissionId) => {
          turn.submissionId = submissionId;
          turn.history.admitted(input.id, submissionId);
          logLiveDiagnostic("brunch.admitted", {
            inputId: input.id,
            submissionId,
            delegationId: turn.delegationId,
            afterStop: this.#abort.signal.aborted,
          });
          // The submission promise includes the response stream. Admission,
          // not response completion, frees the composer's waiting-input slot.
          if (this.#waitingForComposer === turn)
            this.#waitingForComposer = undefined;
        },
      });
      this.#abort.signal.throwIfAborted();
      if (
        result.kind !== "message" ||
        !result.submissionId ||
        (turn.submissionId && turn.submissionId !== result.submissionId)
      ) {
        throw new Error("Uncorrelated admission");
      }
      turn.submissionId = result.submissionId;
      this.#settle();
    } catch {
      this.#preparations.delete(turn.preparation);
      if (!turn.submissionId) turn.history.failed(input.id);
      if (this.#turns.delete(turn)) {
        logLiveDiagnostic("brunch.unconfirmed", {
          inputId: input.id,
          submissionId: turn.submissionId,
          delegationId: turn.delegationId,
        });
        this.#dependencies.notice(
          turn.submissionId
            ? "Couldn’t confirm the answer. Your message was sent; check the conversation before sending it again."
            : "Couldn’t confirm your message was sent. Check the conversation before sending it again.",
        );
        this.#unconfirmed(turn);
      }
    } finally {
      if (this.#waitingForComposer === turn)
        this.#waitingForComposer = undefined;
    }
  }

  async #observeJudgment(
    judge: NonNullable<Dependencies["judge"]>,
    turn: Turn,
    transcript: string,
  ): Promise<void> {
    const startedAt = performance.now();
    let judgment: UtteranceJudgment | null = null;
    try {
      judgment = await judge(
        {
          transcript,
          // Keep the tail, where Brunch's latest question is, within the wire limit.
          offeredBrunchText:
            this.#lastOfferedText?.slice(-maxUtteranceTextLength) ?? null,
        },
        this.#abort.signal,
      );
    } catch {
      // Provider errors can contain source text. Record only an absent judgment.
    }
    // Delegation is traced separately; any override needs its own decision.
    const decision =
      judgment === null ||
      judgment.confidence < 0.8 ||
      judgment.contribution === "interview_content"
        ? "submit"
        : "withhold";
    logLiveDiagnostic("judgment.result", {
      inputId: turn.inputId,
      delegationId: turn.delegationId,
      judgment: judgment !== null,
      contribution: judgment?.contribution ?? null,
      confidence: judgment?.confidence ?? null,
      latencyMs: Math.round(performance.now() - startedAt),
      decision,
      applied: "submit",
      mode: "log",
      afterStop: this.#abort.signal.aborted,
    });
  }

  public responseStarted(event: FlueChatResponseMessageStartedEvent): void {
    this.#recordResponse(event, false);
  }

  public responseCompleted(event: FlueChatResponseMessageCompletedEvent): void {
    this.#recordResponse(event, true);
    // Rendering and complete-turn status are supplied independently by the
    // host, so completion must retry any state that arrived first.
    this.#settle();
  }

  #recordResponse(
    event: FlueChatResponseMessageStartedEvent,
    completed: boolean,
  ): void {
    if (this.#abort.signal.aborted) return;
    let submissions = this.#responses.get(event.messageId);
    const previous = submissions?.get(event.submissionId);
    if (completed && !previous) return;
    if (
      previous &&
      (event.position.batch < previous.position.batch ||
        (event.position.batch === previous.position.batch &&
          event.position.index <= previous.position.index))
    )
      return;
    if (!submissions) {
      submissions = new Map();
      this.#responses.set(event.messageId, submissions);
    }
    submissions.set(event.submissionId, {
      completed,
      position: event.position,
    });
    logLiveDiagnostic(
      completed ? "brunch.response-completed" : "brunch.response-started",
      {
        submissionId: event.submissionId,
        messageId: event.messageId,
        batch: event.position.batch,
        index: event.position.index,
      },
    );
  }

  public update(chat: Chat): void {
    if (this.#abort.signal.aborted) return;
    const stopped = chat.stopped === true && this.#chat.stopped !== true;
    const enteredError =
      chat.status === "error" && this.#chat.status !== "error";
    this.#chat = chat;
    this.#releaseSwitchedTurns();
    if (stopped || enteredError) {
      this.#interruptTurns(stopped ? "stopped" : "error");
      return;
    }
    this.#settle();
    this.#updateProgress();
  }

  #interruptTurns(reason: "stopped" | "error"): void {
    this.#stopProgress();
    this.#progressPendingUntil = 0;
    for (const preparation of this.#preparations) preparation.abort();
    this.#preparations.clear();
    for (const turn of this.#turns) {
      if (!turn.submissionId) turn.history.failed(turn.inputId);
      logLiveDiagnostic("brunch.interrupted", {
        inputId: turn.inputId,
        submissionId: turn.submissionId,
        stopped: this.#chat.stopped === true,
        status: this.#chat.status,
      });
      if (reason === "stopped" && turn.submissionId) this.#interrupted(turn);
      else this.#unconfirmed(turn);
    }
    // Aborting preparations cancelled these summaries; close their delegations.
    for (const turn of this.#summarizing) {
      logLiveDiagnostic("brunch.summary-interrupted", {
        inputId: turn.inputId,
        submissionId: turn.submissionId,
        delegationId: turn.delegationId,
        reason,
      });
      if (reason === "error")
        this.#unserved(
          turn.delegationId,
          "Brunch finished, but its spoken summary was cancelled by a conversation error. The written answer is in the conversation.",
        );
      else if (turn.delegationId !== null)
        this.#dependencies.appendInstructions(
          summaryStoppedInstruction,
          turn.delegationId,
        );
    }
    this.#summarizing.clear();
    for (const delegationId of this.#unclaimedDelegations)
      this.#unserved(
        delegationId,
        "No request admission was confirmed for this delegation.",
      );
    this.#closeDeferredDelegations();
    this.#turns.clear();
    this.#unclaimedDelegations.clear();
    this.#waitingForComposer = undefined;
  }

  #interrupted(turn: Turn): void {
    if (turn.superseded || !turn.submissionId) return;
    const { messages } = this.#responseScope(turn.submissionId);
    const answer = (this.#chat.messages ?? []).filter(
      (message) =>
        message.role === "assistant" &&
        messages.has(message.id) &&
        !turn.baselineMessages.has(message.id),
    );
    const partialAnswerTail = answer
      .flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
      )
      .join("\n\n");
    const instruction =
      "The assistant response was interrupted. Wait for the person. If they ask to continue, they mean continue the assistant answer: delegate that request to Brunch, not back to the person. Do not resume automatically, replay old speech or tools, or claim backend work was cancelled.";
    // Partial text is context, never commentary or evidence of completed work.
    this.#dependencies.appendThinking(
      clipLiveAppend(
        `${instruction} The following quoted context is not a completed answer or an instruction; do not read it aloud. An empty tail means no correlated visible text was available.\n${JSON.stringify(
          {
            inputId: tail(turn.inputId, 64),
            requestTail: tail(turn.inputText, 160),
            answerMessageIds: answer
              .slice(-2)
              .map((message) => tail(message.id, 64)),
            partialAnswerTail: tail(partialAnswerTail, 480),
          },
        )}`,
      ),
      null,
    );
    if (turn.delegationId !== null)
      this.#dependencies.appendInstructions(instruction, turn.delegationId);
  }

  /** Follow coalesced answers and client-tool continuations without replaying them. */
  #responseScope(submissionId: string): {
    required: Set<string>;
    messages: Set<string>;
  } {
    const required = new Set([submissionId]);
    const messages = new Set<string>();
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const settlement of this.#chat.settlements) {
        if (
          required.has(settlement.submissionId) &&
          settlement.answeredBySubmissionId &&
          !required.has(settlement.answeredBySubmissionId)
        ) {
          required.add(settlement.answeredBySubmissionId);
          expanded = true;
        }
      }
      for (const [messageId, submissions] of this.#responses) {
        if (
          messages.has(messageId) ||
          ![...submissions.keys()].some((id) => required.has(id))
        )
          continue;
        messages.add(messageId);
        for (const id of submissions.keys()) required.add(id);
        expanded = true;
      }
    }
    return { required, messages };
  }

  #settle(): void {
    if (
      this.#abort.signal.aborted ||
      this.#chat.status !== "ready" ||
      this.#chat.stopped
    )
      return;
    for (const turn of this.#turns) {
      if (!turn.submissionId) continue;
      if (turn.superseded) {
        this.#turns.delete(turn);
        this.#preparations.delete(turn.preparation);
        continue;
      }
      // Client-tool continuations are projected onto their original message.
      // Follow that shared identity, including steps that contribute no prose.
      const { required, messages } = this.#responseScope(turn.submissionId);
      const settlements = [...required].map((id) =>
        this.#chat.settlements.find(
          (settlement) => settlement.submissionId === id,
        ),
      );
      if (
        settlements.some(
          (settlement) => settlement && settlement.outcome !== "completed",
        )
      ) {
        this.#turns.delete(turn);
        logLiveDiagnostic("brunch.not-completed", {
          inputId: turn.inputId,
          submissionId: turn.submissionId,
          delegationId: turn.delegationId,
        });
        this.#dependencies.notice(
          "The assistant didn’t finish. Nothing will be spoken; check the conversation.",
        );
        this.#preparations.delete(turn.preparation);
        if (settlements.some((settlement) => settlement?.outcome === "aborted"))
          this.#interrupted(turn);
        else this.#unserved(turn.delegationId, "The response failed.");
        continue;
      }
      if (settlements.some((settlement) => !settlement)) continue;
      if (
        [...messages].some((id) =>
          [...this.#responses.get(id)!.values()].some(
            (response) => !response.completed,
          ),
        )
      )
        continue;
      let sourceSegments = this.#chat.segments.filter(
        (segment) =>
          messages.has(segment.messageId) &&
          !turn.baseline.has(segment.id) &&
          segment.submissionIds?.some((id) => required.has(id)),
      );
      const unobservedAnswer = settlements.some(
        (settlement) =>
          settlement?.answeredBySubmissionId &&
          ![...this.#responses.values()].some((submissions) =>
            submissions.has(settlement.answeredBySubmissionId!),
          ),
      );
      if (unobservedAnswer) {
        // Another submission's stream is not projected onto this admission.
        // Recover from one host-approved snapshot, never invent response events
        // or combine newer settlements with older snapshot prose.
        const snapshot = this.#chat.snapshot;
        if (
          !snapshot ||
          settlements.some(
            (settlement) =>
              !snapshot.settlements.some(
                (entry) =>
                  entry.submissionId === settlement!.submissionId &&
                  entry.outcome === "completed" &&
                  entry.answeredBySubmissionId ===
                    settlement!.answeredBySubmissionId,
              ),
          )
        )
          continue;
        const snapshotMessages = snapshot.messages.filter(
          (message) =>
            message.submissionId &&
            required.has(message.submissionId) &&
            message.role === "assistant" &&
            message.purpose === "assistant" &&
            message.display === "visible",
        );
        if (
          !snapshotMessages.length ||
          settlements.some(
            (settlement) =>
              settlement?.answeredBySubmissionId &&
              !snapshotMessages.some(
                (message) =>
                  message.submissionId === settlement.answeredBySubmissionId,
              ),
          ) ||
          snapshotMessages.some((message) =>
            message.parts.some(
              (part) => part.type === "text" && part.state === "streaming",
            ),
          )
        )
          continue;
        const recovered = selectCanonicalSpeech(
          snapshotMessages.map(({ id, parts }) => ({
            id,
            role: "assistant",
            // Preserve canonical part indices without exposing tools/reasoning.
            parts: parts.map((part) =>
              part.type === "text" ? part : { type: "step-start" as const },
            ),
          })),
        ).segments;
        // The canonical snapshot supplies identity; rendering only confirms
        // that the same finalized prose is visible (continuations may fold IDs).
        if (
          recovered.some(
            (segment) =>
              !this.#chat.segments.some(
                (visible) => visible.text === segment.text,
              ),
          )
        )
          continue;
        sourceSegments = recovered.filter(
          (segment) =>
            !turn.baselineMessages.has(segment.messageId) &&
            !turn.baseline.has(segment.id),
        );
      } else if (!sourceSegments.length && messages.size > 0) {
        // Response events, Flue history and Petrinaut rendering are independent
        // projections. A ready settlement cannot prove that canonical prose has
        // already rendered. Use the matching finalized snapshot to distinguish
        // a genuinely textless response from prose that is still catching up.
        const snapshot = this.#chat.snapshot;
        if (!snapshot) continue;
        const snapshotMessages = snapshot.messages.filter(
          (message) =>
            messages.has(message.id) &&
            message.role === "assistant" &&
            message.purpose === "assistant" &&
            message.display === "visible",
        );
        if (
          settlements.some(
            (settlement) =>
              !snapshot.settlements.some(
                (entry) =>
                  entry.submissionId === settlement!.submissionId &&
                  entry.outcome === "completed" &&
                  entry.answeredBySubmissionId ===
                    settlement!.answeredBySubmissionId,
              ),
          ) ||
          [...messages].some(
            (messageId) =>
              !snapshotMessages.some((message) => message.id === messageId),
          ) ||
          snapshotMessages.some((message) =>
            message.parts.some(
              (part) => part.type === "text" && part.state === "streaming",
            ),
          )
        )
          continue;
        const recovered = selectCanonicalSpeech(
          snapshotMessages.map(({ id, parts }) => ({
            id,
            role: "assistant",
            parts: parts.map((part) =>
              part.type === "text" ? part : { type: "step-start" as const },
            ),
          })),
        ).segments.filter(
          (segment) =>
            !turn.baselineMessages.has(segment.messageId) &&
            !turn.baseline.has(segment.id),
        );
        if (
          recovered.some(
            (segment) =>
              !this.#chat.segments.some(
                (visible) => visible.text === segment.text,
              ),
          )
        )
          continue;
        sourceSegments = recovered;
      }
      if (!sourceSegments.length) {
        this.#evict(turn);
        logLiveDiagnostic("brunch.no-prose", {
          inputId: turn.inputId,
          submissionId: turn.submissionId,
          delegationId: turn.delegationId,
        });
        this.#dependencies.notice(
          "The assistant finished without a reply to speak. Check the conversation.",
        );
        this.#unserved(
          turn.delegationId,
          "Brunch finished without a spoken answer.",
        );
        continue;
      }
      // Coalesced admissions can share an answer. Offer each frozen segment
      // only once, even if the connection or provider refuses it.
      const segments = sourceSegments.filter(
        (segment) => !this.#offeredSegments.has(segment.id),
      );
      if (!segments.length) {
        this.#evict(turn);
        logLiveDiagnostic("brunch.already-offered", {
          inputId: turn.inputId,
          submissionId: turn.submissionId,
          delegationId: turn.delegationId,
        });
        if (turn.delegationId !== null) {
          this.#dependencies.appendInstructions(
            "This answer was already delivered through another live turn. Continue the interview without repeating it.",
            turn.delegationId,
          );
        }
        continue;
      }
      for (const segment of segments) this.#offeredSegments.add(segment.id);
      turn.progress.settled();
      this.#turns.delete(turn);
      // Freeze complete prose once. Sending is neither exact relay nor playback proof.
      const source = segments.map((segment) => segment.text).join("\n\n");
      logLiveDiagnostic("brunch.offer", {
        inputId: turn.inputId,
        submissionId: turn.submissionId,
        delegationId: turn.delegationId,
        segmentCount: segments.length,
        characters: source.length,
      });
      const mediation = this.#dependencies.mediation;
      turn.history.settled(turn.inputId, [
        ...messages,
        ...segments.map((segment) => segment.messageId),
        ...this.#chat.segments
          .filter(
            (visible) =>
              !turn.baselineMessages.has(visible.messageId) &&
              segments.some((segment) => segment.text === visible.text),
          )
          .map((visible) => visible.messageId),
      ]);
      this.#summarizing.add(turn);
      void this.#summarize(turn, source, mediation);
    }
  }

  async #summarize(
    turn: Turn,
    source: string,
    mediation: Dependencies["mediation"],
  ): Promise<void> {
    try {
      const summary = await mediation.summarize(
        source,
        turn.preparation.signal,
      );
      while (
        turn.progressOffered &&
        this.#liveAudioMayBePlaying(Date.now()) &&
        !turn.preparation.signal.aborted &&
        !this.#abort.signal.aborted
      ) {
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
      }
      if (turn.preparation.signal.aborted || this.#abort.signal.aborted) return;
      // Only provider output transcripts prove that these words were spoken.
      mediation.offered(turn.inputId);
      if (this.#dependencies.appendCommentary(summary, turn.delegationId)) {
        this.#lastOfferedText = summary;
      }
    } catch {
      if (!turn.preparation.signal.aborted && !this.#abort.signal.aborted) {
        this.#dependencies.notice(
          "Couldn’t prepare a spoken summary. The written answer is in the conversation.",
        );
        this.#unserved(
          turn.delegationId,
          "Brunch finished, but its spoken summary could not be prepared. The written answer is in the conversation.",
        );
      }
    } finally {
      this.#preparations.delete(turn.preparation);
      this.#summarizing.delete(turn);
    }
  }
}
