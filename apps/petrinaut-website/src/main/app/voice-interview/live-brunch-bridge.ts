import type { CanonicalSpeechSegment } from "./canonical-speech";
import type {
  RealtimeBrunchBridge,
  VoiceSubmissionSettlement,
} from "./realtime-brunch-bridge";
import type {
  FlueChatResponseMessageCompletedEvent,
  FlueChatResponseMessageStartedEvent,
} from "@hashintel/brunch-agent-transport-aisdk";
import type { PetrinautAiVoiceModeContext } from "@hashintel/petrinaut/ui";

interface Chat {
  readonly canAcceptVoiceInput: boolean;
  readonly segments: readonly CanonicalSpeechSegment[];
  readonly settlements: readonly VoiceSubmissionSettlement[];
  readonly status: PetrinautAiVoiceModeContext["status"];
  readonly stopped?: boolean;
}

interface Turn {
  readonly baseline: ReadonlySet<string>;
  submissionId?: string;
  sawBusy: boolean;
}

type Submit = ConstructorParameters<
  typeof RealtimeBrunchBridge
>[0]["submitInterviewAnswer"];
interface Dependencies {
  readonly submit: Submit;
  readonly appendCommentary: (text: string) => boolean;
  readonly notice: (message: string | null) => void;
}

/** Session-local correlation only. Flue and the composer retain all canonical ownership. */
export class LiveBrunchBridge {
  readonly #dependencies: Dependencies;
  readonly #abort = new AbortController();
  readonly #seenInputs = new Set<string>();
  readonly #turns = new Set<Turn>();
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
  #waitingForComposer = false;
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
    this.#turns.clear();
  }

  public async accept(input: {
    readonly id: string;
    readonly text: string;
  }): Promise<void> {
    if (this.#abort.signal.aborted || this.#seenInputs.has(input.id)) return;
    this.#seenInputs.add(input.id);
    if (!input.text.trim()) return;
    if (
      input.text.length > 32_000 ||
      this.#waitingForComposer ||
      !this.#chat.canAcceptVoiceInput
    ) {
      this.#dependencies.notice(
        "That utterance was not retained. Wait for the pending input, then use the composer to send it.",
      );
      return;
    }
    this.#waitingForComposer = true;
    this.#dependencies.notice(null);
    const turn: Turn = {
      baseline: new Set(this.#chat.segments.map((segment) => segment.id)),
      sawBusy:
        this.#chat.status === "submitted" || this.#chat.status === "streaming",
    };
    this.#turns.add(turn);
    try {
      const result = await this.#dependencies.submit({
        ...input,
        admissionTarget: { kind: "user", messageId: input.id },
        signal: this.#abort.signal,
        onAdmission: (submissionId) => {
          turn.submissionId = submissionId;
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
      if (this.#turns.delete(turn)) {
        this.#dependencies.notice(
          "Voice admission could not be confirmed. Check canonical history before sending again; no automatic retry was made.",
        );
      }
    } finally {
      this.#waitingForComposer = false;
    }
  }

  public responseStarted(event: FlueChatResponseMessageStartedEvent): void {
    this.#recordResponse(event, false);
  }

  public responseCompleted(event: FlueChatResponseMessageCompletedEvent): void {
    this.#recordResponse(event, true);
    // Rendering and complete-turn status are supplied by the host, not this event.
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
  }

  public update(chat: Chat): void {
    if (this.#abort.signal.aborted) return;
    this.#chat = chat;
    if (chat.stopped || chat.status === "error") {
      this.#turns.clear();
      return;
    }
    if (chat.status === "submitted" || chat.status === "streaming") {
      for (const turn of this.#turns) turn.sawBusy = true;
    }
    this.#settle();
  }

  #settle(): void {
    if (
      this.#abort.signal.aborted ||
      this.#chat.status !== "ready" ||
      this.#chat.stopped
    )
      return;
    for (const turn of this.#turns) {
      if (!turn.submissionId || !turn.sawBusy) continue;
      // Client-tool continuations are projected onto their original message.
      // Follow that shared identity, including steps that contribute no prose.
      const required = new Set([turn.submissionId]);
      const messages = new Set<string>();
      let expanded = true;
      while (expanded) {
        expanded = false;
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
        this.#dependencies.notice(
          "Brunch did not complete this turn. Check the conversation; no result was offered to Live.",
        );
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
      const segments = this.#chat.segments.filter(
        (segment) =>
          messages.has(segment.messageId) &&
          !turn.baseline.has(segment.id) &&
          segment.submissionIds?.some((id) => required.has(id)),
      );
      this.#turns.delete(turn);
      if (!segments.length) {
        this.#dependencies.notice(
          "Brunch settled without a spoken answer. Check the conversation.",
        );
        continue;
      }
      // Freeze complete prose once. Sending is neither exact relay nor playback proof.
      const source = segments.map((segment) => segment.text).join("\n\n");
      if (!this.#dependencies.appendCommentary(source)) {
        this.#dependencies.notice(
          "The settled answer was not offered to Live (size or connection limit). Read the full answer in the conversation; it was not truncated or replayed.",
        );
      }
    }
  }
}
