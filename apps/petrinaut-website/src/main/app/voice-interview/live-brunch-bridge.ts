import { serializeVoiceBrief } from "../../../shared/voice-mediation";
import { selectCanonicalSpeech } from "./canonical-speech";
import { logLiveDiagnostic } from "./shared/live-diagnostic";

import type { VoiceBriefFields } from "../../../shared/voice-mediation";
import type { CanonicalSpeechSegment } from "./canonical-speech";
import type {
  RealtimeBrunchBridge,
  VoiceSubmissionSettlement,
} from "./realtime-brunch-bridge";
import type { VoiceMediationHistory } from "./voice-mediation-history";
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
  submitted?: boolean;
  submissionId?: string;
  /** The conversation history the turn began in, so a switch cannot split it. */
  readonly history?: VoiceMediationHistory;
}

type Submit = ConstructorParameters<
  typeof RealtimeBrunchBridge
>[0]["submitInterviewAnswer"];
interface Dependencies {
  readonly submit: Submit;
  readonly mediation?: {
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
  readonly appendInstructions: (text: string, delegationId: string) => boolean;
  /** Quiet interruption context, never spoken or bound to a delegation. */
  readonly appendThinking: (text: string, delegationId: null) => boolean;
  readonly notice: (message: string | null) => void;
}

/** GPT-Live accepts at most 500 tokens per append; stay well inside it. */
const liveAppendCharacterBudget = 1_400;

const tail = (text: string, limit: number): string =>
  text.length <= limit ? text : `…${text.slice(-(limit - 1))}`;

const clipLiveAppend = (text: string): string =>
  text.length <= liveAppendCharacterBudget
    ? text
    : `${text.slice(0, liveAppendCharacterBudget - 1).trimEnd()}…`;

/** Session-local correlation only. Flue and the composer retain all canonical ownership. */
export class LiveBrunchBridge {
  readonly #dependencies: Dependencies;
  readonly #abort = new AbortController();
  readonly #seenInputs = new Set<string>();
  readonly #offeredSegments = new Set<string>();
  readonly #turns = new Set<Turn>();
  readonly #preparations = new Set<AbortController>();
  readonly #unclaimedDelegations = new Set<string>();
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
  #chat: Chat = {
    canAcceptVoiceInput: false,
    segments: [],
    settlements: [],
    status: "ready",
  };

  public constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  public stop(): void {
    this.#abort.abort();
    this.speechStarted();
    this.#turns.clear();
    this.#unclaimedDelegations.clear();
  }

  /** Stop future speech offers, not work already admitted by Brunch. */
  public speechStarted(): void {
    for (const preparation of this.#preparations) preparation.abort();
    this.#preparations.clear();
    for (const turn of this.#turns) {
      if (!turn.submissionId) turn.history?.failed(turn.inputId);
      // Words cancelled before submission stay sendable; teardown withdraws them.
      if (
        !turn.submitted &&
        !this.#abort.signal.aborted &&
        turn.history === this.#dependencies.mediation?.history
      )
        turn.history?.unsent(
          turn.inputId,
          turn.inputText,
          this.#chat.messages?.at(-1)?.id,
        );
      if (turn.delegationId !== null && !this.#abort.signal.aborted)
        this.#dependencies.appendInstructions(
          "The person started speaking again. Do not answer the earlier request; listen to them.",
          turn.delegationId,
        );
    }
    this.#turns.clear();
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

  /** Frees the composer from one stale turn; other turns and delegations stay. */
  #evict(turn: Turn): void {
    turn.preparation.abort();
    this.#preparations.delete(turn.preparation);
    if (!turn.submissionId) turn.history?.failed(turn.inputId);
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
    if (turn) turn.delegationId = delegationId;
    else this.#unclaimedDelegations.add(delegationId);
    logLiveDiagnostic(turn ? "delegation.matched" : "delegation.unclaimed", {
      delegationId,
      inputId: turn?.inputId,
      submissionId: turn?.submissionId,
    });
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

  public async accept(input: {
    readonly id: string;
    readonly text: string;
    readonly superseded?: boolean;
  }): Promise<void> {
    if (this.#abort.signal.aborted) return;
    if (this.#seenInputs.has(input.id)) {
      logLiveDiagnostic("input.ignored", {
        inputId: input.id,
        reason: "duplicate",
      });
      return;
    }
    this.#seenInputs.add(input.id);
    if (!input.superseded && this.#waitingForComposer?.superseded)
      this.#evict(this.#waitingForComposer);
    const delegationId = input.superseded
      ? null
      : ([...this.#unclaimedDelegations].at(-1) ?? null);
    if (delegationId !== null) this.#unclaimedDelegations.delete(delegationId);
    if (!input.text.trim()) {
      logLiveDiagnostic("input.ignored", {
        inputId: input.id,
        delegationId,
        reason: "empty",
      });
      if (delegationId !== null) {
        this.#dependencies.appendInstructions(
          "No usable speech was captured for this turn. Ask the person to continue without assuming an answer.",
          delegationId,
        );
      }
      return;
    }
    if (
      input.text.length > 32_000 ||
      this.#waitingForComposer ||
      !this.#chat.canAcceptVoiceInput
    ) {
      logLiveDiagnostic("input.dropped", {
        inputId: input.id,
        delegationId,
        superseded: input.superseded === true,
        oversized: input.text.length > 32_000,
        waitingForComposer: this.#waitingForComposer !== undefined,
        admissionUnavailable: !this.#chat.canAcceptVoiceInput,
      });
      // Newer speech already replaced these words; resending them is not asked for.
      if (input.superseded) return;
      this.#dependencies.notice(
        "That utterance was not retained. Wait for the pending input, then use the composer to send it.",
      );
      const history = this.#dependencies.mediation?.history;
      const waiting = this.#waitingForComposer;
      history?.unsent(
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
      history: this.#dependencies.mediation?.history,
      baseline: new Set(this.#chat.segments.map((segment) => segment.id)),
      baselineMessages: new Set([
        ...this.#chat.segments.map((segment) => segment.messageId),
        ...(this.#chat.messages?.map((message) => message.id) ?? []),
        ...(this.#chat.snapshot?.messages.map((message) => message.id) ?? []),
      ]),
    };
    this.#waitingForComposer = turn;
    this.#turns.add(turn);
    this.#preparations.add(turn.preparation);
    try {
      const mediation = this.#dependencies.mediation;
      let text = input.text;
      if (mediation) {
        turn.history?.begin(input);
        let fields: VoiceBriefFields = {};
        try {
          fields = await mediation.prepare(input.text, turn.preparation.signal);
        } catch {
          turn.preparation.signal.throwIfAborted();
          logLiveDiagnostic("brief.unavailable", { inputId: input.id });
        }
        turn.preparation.signal.throwIfAborted();
        turn.history?.prepared(input.id, fields);
        text = serializeVoiceBrief(input.text, fields);
      }
      logLiveDiagnostic("brunch.submit", { inputId: input.id, delegationId });
      turn.submitted = true;
      const result = await this.#dependencies.submit({
        ...input,
        text,
        admissionTarget: { kind: "user", messageId: input.id },
        signal: this.#abort.signal,
        onAdmission: (submissionId) => {
          turn.submissionId = submissionId;
          turn.history?.admitted(input.id, submissionId);
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
      if (!turn.submissionId) turn.history?.failed(input.id);
      if (this.#turns.delete(turn)) {
        logLiveDiagnostic("brunch.unconfirmed", {
          inputId: input.id,
          submissionId: turn.submissionId,
          delegationId: turn.delegationId,
        });
        this.#dependencies.notice(
          turn.submissionId
            ? "Your message was admitted, but its response could not be confirmed. Check canonical history; no automatic retry was made."
            : "Voice admission could not be confirmed. Check canonical history before sending again; no automatic retry was made.",
        );
        this.#unconfirmed(turn);
      }
    } finally {
      if (this.#waitingForComposer === turn)
        this.#waitingForComposer = undefined;
    }
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
    if (stopped || enteredError) {
      this.#interruptTurns(stopped ? "stopped" : "error");
      return;
    }
    this.#settle();
  }

  #interruptTurns(reason: "stopped" | "error"): void {
    for (const preparation of this.#preparations) preparation.abort();
    this.#preparations.clear();
    for (const turn of this.#turns) {
      if (!turn.submissionId) turn.history?.failed(turn.inputId);
      logLiveDiagnostic("brunch.interrupted", {
        inputId: turn.inputId,
        submissionId: turn.submissionId,
        stopped: this.#chat.stopped === true,
        status: this.#chat.status,
      });
      if (reason === "stopped" && turn.submissionId) this.#interrupted(turn);
      else this.#unconfirmed(turn);
    }
    for (const delegationId of this.#unclaimedDelegations)
      this.#unserved(
        delegationId,
        "No request admission was confirmed for this delegation.",
      );
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
          "Brunch did not complete this turn. Check the conversation; no result was offered to Live.",
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
          "Brunch settled without a spoken answer. Check the conversation.",
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
      if (mediation) {
        turn.history?.settled(turn.inputId, [
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
        void this.#summarize(turn, source, mediation);
      } else {
        this.#preparations.delete(turn.preparation);
        this.#dependencies.appendCommentary(source, turn.delegationId);
      }
    }
  }

  async #summarize(
    turn: Pick<Turn, "inputId" | "preparation" | "delegationId">,
    source: string,
    mediation: NonNullable<Dependencies["mediation"]>,
  ): Promise<void> {
    try {
      const summary = await mediation.summarize(
        source,
        turn.preparation.signal,
      );
      if (turn.preparation.signal.aborted || this.#abort.signal.aborted) return;
      // Only the provider's output transcript becomes a blue card. This marks
      // the upcoming append for timeline grouping, not proof of spoken words.
      mediation.offered(turn.inputId);
      this.#dependencies.appendCommentary(summary, turn.delegationId);
    } catch {
      if (!turn.preparation.signal.aborted && !this.#abort.signal.aborted) {
        this.#dependencies.notice(
          "Brunch finished, but its spoken summary could not be prepared. Read the written answer; no automatic retry was made.",
        );
        this.#unserved(
          turn.delegationId,
          "Brunch finished, but its spoken summary could not be prepared. The written answer is in the conversation.",
        );
      }
    } finally {
      this.#preparations.delete(turn.preparation);
    }
  }
}
