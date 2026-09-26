import { serializeVoiceBrief } from "../../../shared/voice-mediation";
import { selectCanonicalSpeech } from "./canonical-speech";
import {
  describeLedgerCoverage,
  selectAppliedWorkpieceRevision,
} from "./live-brunch-bridge/ledger-coverage-note";
import { matchPlaybackCommand } from "./live-brunch-bridge/playback-command";
import { logLiveDiagnostic } from "./shared/live-diagnostic";

import type { VoiceBriefFields } from "../../../shared/voice-mediation";
import type { CanonicalSpeechSegment } from "./canonical-speech";
import type { PlaybackCommand } from "./live-brunch-bridge/playback-command";
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
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

interface Chat {
  readonly canAcceptVoiceInput: boolean;
  readonly segments: readonly CanonicalSpeechSegment[];
  readonly settlements: readonly VoiceSubmissionSettlement[];
  readonly snapshot?: FlueConversationState;
  readonly status: PetrinautAiVoiceModeContext["status"];
  readonly stopped?: boolean;
}

interface Turn {
  readonly inputId: string;
  readonly superseded?: boolean;
  readonly preparation: AbortController;
  readonly baseline: ReadonlySet<string>;
  readonly baselineMessages: ReadonlySet<string>;
  delegationId: string | null;
  submissionId?: string;
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
  /** Quiet session context; never spoken and never bound to a delegation here. */
  readonly appendThinking: (text: string, delegationId: null) => boolean;
  readonly notice: (message: string | null) => void;
  /**
   * The canvas playback controls, when the voice session runs inside a
   * Petrinaut editor. Absent, every utterance is a Brunch turn.
   */
  readonly playback?: {
    readonly play: () => Promise<void>;
    readonly pause: () => void;
    readonly stop: () => void;
  };
}

const spokenPlaybackOutcome: Record<PlaybackCommand, string> = {
  play: "Playing.",
  pause: "Paused.",
  stop: "Stopped. The simulation is back at the start.",
};

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
  #offeredCoverageRevision: string | undefined;
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
      if (!turn.submissionId)
        this.#dependencies.mediation?.history.failed(turn.inputId);
    }
    this.#turns.clear();
    this.#unclaimedDelegations.clear();
    this.#waitingForComposer = undefined;
  }

  public stopResponse(): void {
    if (this.#abort.signal.aborted) return;
    this.#chat = { ...this.#chat, stopped: true };
    this.#interruptTurns();
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

  #unserved(delegationId: string | null): void {
    if (delegationId === null || this.#abort.signal.aborted) return;
    this.#dependencies.appendInstructions(
      "The backend could not take that request now. Ask the person to continue. Do not claim the work completed or was cancelled.",
      delegationId,
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
      this.speechStarted();
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
    const { playback } = this.#dependencies;
    const playbackCommand = playback ? matchPlaybackCommand(input.text) : null;
    if (playback && playbackCommand !== null) {
      await this.#runPlaybackCommand(
        playback,
        playbackCommand,
        input.id,
        delegationId,
      );
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
        oversized: input.text.length > 32_000,
        waitingForComposer: this.#waitingForComposer !== undefined,
        admissionUnavailable: !this.#chat.canAcceptVoiceInput,
      });
      this.#dependencies.notice(
        "That utterance was not retained. Wait for the pending input, then use the composer to send it.",
      );
      this.#unserved(delegationId);
      return;
    }
    this.#dependencies.notice(null);
    const turn: Turn = {
      inputId: input.id,
      superseded: input.superseded,
      preparation: new AbortController(),
      delegationId,
      baseline: new Set(this.#chat.segments.map((segment) => segment.id)),
      baselineMessages: new Set([
        ...this.#chat.segments.map((segment) => segment.messageId),
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
        mediation.history.begin(input);
        const fields = await mediation.prepare(
          input.text,
          turn.preparation.signal,
        );
        turn.preparation.signal.throwIfAborted();
        mediation.history.prepared(input.id, fields);
        text = serializeVoiceBrief(fields);
      }
      logLiveDiagnostic("brunch.submit", { inputId: input.id, delegationId });
      const result = await this.#dependencies.submit({
        ...input,
        text,
        admissionTarget: { kind: "user", messageId: input.id },
        signal: this.#abort.signal,
        onAdmission: (submissionId) => {
          turn.submissionId = submissionId;
          this.#dependencies.mediation?.history.admitted(
            input.id,
            submissionId,
          );
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
      if (!turn.submissionId)
        this.#dependencies.mediation?.history.failed(input.id);
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
        this.#unserved(turn.delegationId);
      }
    } finally {
      if (this.#waitingForComposer === turn)
        this.#waitingForComposer = undefined;
    }
  }

  /**
   * Play, pause and stop are answered here, not by Brunch: they must land
   * while the canvas is still showing what the person reacted to, and they
   * change nothing in the model. The spoken outcome follows the control's
   * own result, so the voice never announces playback that did not start.
   */
  async #runPlaybackCommand(
    playback: NonNullable<Dependencies["playback"]>,
    command: PlaybackCommand,
    inputId: string,
    delegationId: string | null,
  ): Promise<void> {
    let failure: string | null = null;
    try {
      await playback[command]();
    } catch (caught) {
      failure = caught instanceof Error ? caught.message : String(caught);
    }
    if (this.#abort.signal.aborted) return;
    logLiveDiagnostic("playback.command", {
      inputId,
      delegationId,
      command,
      failed: failure !== null,
    });
    if (failure === null) {
      this.#dependencies.appendCommentary(
        spokenPlaybackOutcome[command],
        delegationId,
      );
      return;
    }
    this.#dependencies.notice(
      `The simulation could not ${command}: ${failure}`,
    );
    if (delegationId !== null) {
      this.#dependencies.appendInstructions(
        `The canvas could not ${command} the simulation: ${failure}. Tell the person briefly and ask how to continue. Do not claim the simulation is ${command === "play" ? "playing" : `${command}ped`}.`,
        delegationId,
      );
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
      this.#interruptTurns();
      return;
    }
    this.#offerCoverage();
    this.#settle();
  }

  /**
   * Quiet context precedes any spoken answer from the same update. One note
   * per applied Ledger revision: GPT-Live's session context accumulates every
   * append, so a note is repeated only if the local send failed.
   */
  #offerCoverage(): void {
    const revision = selectAppliedWorkpieceRevision(
      this.#chat.snapshot?.messages ?? [],
    );
    if (!revision || revision.revisionId === this.#offeredCoverageRevision)
      return;
    const note = describeLedgerCoverage(revision);
    const sent = this.#dependencies.appendThinking(note, null);
    logLiveDiagnostic("brunch.coverage", {
      revisionId: revision.revisionId,
      characters: note.length,
      sent,
    });
    if (sent) this.#offeredCoverageRevision = revision.revisionId;
  }

  #interruptTurns(): void {
    for (const preparation of this.#preparations) preparation.abort();
    this.#preparations.clear();
    for (const turn of this.#turns) {
      if (!turn.submissionId)
        this.#dependencies.mediation?.history.failed(turn.inputId);
      logLiveDiagnostic("brunch.interrupted", {
        inputId: turn.inputId,
        submissionId: turn.submissionId,
        stopped: this.#chat.stopped === true,
        status: this.#chat.status,
      });
      this.#unserved(turn.delegationId);
    }
    for (const delegationId of this.#unclaimedDelegations)
      this.#unserved(delegationId);
    this.#turns.clear();
    this.#unclaimedDelegations.clear();
    this.#waitingForComposer = undefined;
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
      const required = new Set([turn.submissionId]);
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
        this.#unserved(turn.delegationId);
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
      this.#turns.delete(turn);
      if (!sourceSegments.length) {
        logLiveDiagnostic("brunch.no-prose", {
          inputId: turn.inputId,
          submissionId: turn.submissionId,
          delegationId: turn.delegationId,
        });
        this.#dependencies.notice(
          "Brunch settled without a spoken answer. Check the conversation.",
        );
        this.#unserved(turn.delegationId);
        continue;
      }
      // Coalesced admissions can share an answer. Offer each frozen segment
      // only once, even if the connection or provider refuses it.
      const segments = sourceSegments.filter(
        (segment) => !this.#offeredSegments.has(segment.id),
      );
      if (!segments.length) {
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
        mediation.history.settled(turn.inputId, [
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

  public offerResult(id: string, source: string, responseIds: string[]): void {
    const mediation = this.#dependencies.mediation;
    if (
      !mediation ||
      this.#abort.signal.aborted ||
      !responseIds.length ||
      this.#seenInputs.has(id)
    )
      return;
    this.#seenInputs.add(id);
    const preparation = new AbortController();
    this.#preparations.add(preparation);
    mediation.history.result(id, responseIds);
    void this.#summarize(
      { inputId: id, preparation, delegationId: null },
      source,
      mediation,
    );
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
      if (!turn.preparation.signal.aborted && !this.#abort.signal.aborted)
        this.#dependencies.notice(
          "Brunch finished, but its spoken summary could not be prepared. Read the written answer; no automatic retry was made.",
        );
    } finally {
      this.#preparations.delete(turn.preparation);
    }
  }
}
