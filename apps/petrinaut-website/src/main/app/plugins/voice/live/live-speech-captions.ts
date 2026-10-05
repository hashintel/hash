import type { VoiceLine } from "../../../../../shared/voice-mediation";

export interface LiveTranscriptFragment {
  readonly id: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}
type Window = {
  id?: string;
  previewId?: string;
  startMs: number;
  endMs?: number;
  wrapUpMs?: number;
  closed: boolean;
};
type InputPreview = {
  update: (id: string, text: string) => void;
  discard: (id: string) => void;
};

const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/**
 * Display grouping on Live's timeline, not a claim of response identity or
 * heard playback. Context delivery is only a hint: keep the sentence crossing
 * that point together in the wrap-up, preserving the exact transcript. Another
 * input or session closure closes the group. No silence timeout.
 */
export class LiveSpeechCaptions {
  readonly #caption: (
    id: string,
    kind: "reply" | "wrapUp",
    line: VoiceLine,
  ) => void;
  readonly #windows: Window[] = [];
  readonly #fragments = new Map<string, LiveTranscriptFragment>();
  readonly #inputFragments = new Map<string, LiveTranscriptFragment>();
  readonly #seenInputIds = new Set<string>();
  readonly #input?: InputPreview;
  #inputFloor = 0;
  #inputEnd = 0;
  #waitingForInput = true;
  #pendingId?: string;
  #closed = false;

  public constructor(
    caption: (id: string, kind: "reply" | "wrapUp", line: VoiceLine) => void,
    input?: InputPreview,
  ) {
    this.#caption = caption;
    this.#input = input;
  }

  public speechStarted(): void {
    if (this.#closed) return;
    const previous = this.#windows.at(-1);
    if (previous) {
      previous.closed = true;
      if (previous.previewId) this.#input?.discard(previous.previewId);
    }
    this.#inputFloor = this.#inputEnd;
    this.#inputFragments.clear();
    this.#waitingForInput = true;
    this.#pendingId = undefined;
    this.#publish();
  }
  public input(fragment: LiveTranscriptFragment): void {
    if (
      this.#closed ||
      this.#seenInputIds.has(fragment.id) ||
      fragment.startMs < this.#inputFloor
    )
      return;
    this.#seenInputIds.add(fragment.id);
    this.#inputEnd = Math.max(this.#inputEnd, fragment.endMs);
    let window = this.#windows.at(-1);
    if (this.#waitingForInput) {
      if (window && fragment.startMs <= window.startMs) return;
      if (window) window.endMs = fragment.startMs;
      window = {
        startMs: fragment.startMs,
        id: this.#pendingId,
        previewId: this.#pendingId
          ? undefined
          : `voice-preview:${crypto.randomUUID()}`,
        closed: false,
      };
      this.#windows.push(window);
      this.#pendingId = undefined;
      this.#waitingForInput = false;
      this.#publish();
    }
    if (!window || window.closed || window.id) return;
    this.#inputFragments.set(fragment.id, fragment);
    // Out-of-order chunks may move the active start, never an earlier turn.
    window.startMs = Math.min(window.startMs, fragment.startMs);
    const previous = this.#windows.at(-2);
    if (previous) previous.endMs = window.startMs;
    if (window.previewId) {
      const text = [...this.#inputFragments.values()]
        .sort((left, right) => left.startMs - right.startMs)
        .map((candidate) => candidate.text)
        .join("");
      this.#input?.update(window.previewId, text);
    }
    this.#publish();
  }
  /** Returns the display-only input to retire; only finalized input is admitted. */
  public begin(id: string): string | undefined {
    if (this.#closed) return;
    const window = this.#windows.at(-1);
    let previewId: string | undefined;
    if (!this.#waitingForInput && window && !window.id) {
      window.id = id;
      previewId = window.previewId;
      window.previewId = undefined;
    } else this.#pendingId = id;
    this.#publish();
    return previewId;
  }
  public wrapUp(id: string, startMs: number): void {
    if (this.#closed) return;
    let window = this.#windows.find((candidate) => candidate.id === id);
    if (!window) {
      const previous = this.#windows.at(-1);
      if (previous && (previous.closed || startMs < previous.startMs)) return;
      if (previous) {
        previous.closed = true;
        previous.endMs = startMs;
      }
      window = { id, startMs, closed: false };
      this.#windows.push(window);
    }
    if (window.closed || startMs < window.startMs) return;
    window.wrapUpMs = startMs;
    this.#publish();
  }
  public output(fragment: LiveTranscriptFragment): void {
    if (this.#closed || this.#fragments.has(fragment.id)) return;
    this.#fragments.set(fragment.id, fragment);
    this.#publish();
  }
  public close(): void {
    this.#closed = true;
    for (const window of this.#windows) {
      window.closed = true;
      if (window.previewId) this.#input?.discard(window.previewId);
    }
    this.#publish();
  }
  #publish(): void {
    const fragments = [...this.#fragments.values()].sort(
      (left, right) => left.startMs - right.startMs,
    );
    for (const window of this.#windows) {
      if (!window.id) continue;
      const matching = fragments.filter(
        (fragment) =>
          fragment.startMs >= window.startMs &&
          (window.endMs === undefined || fragment.startMs < window.endMs),
      );
      const text = matching.map((fragment) => fragment.text).join("");
      let replyEnd = text.length;
      if (window.wrapUpMs !== undefined) {
        let boundary = 0;
        let timedReplyEnd = 0;
        for (const fragment of matching) {
          if (fragment.startMs < window.wrapUpMs)
            timedReplyEnd += fragment.text.length;
          // Timing belongs to the fragment, not its individual words. Treat
          // overlapping fragments as possibly containing the result too.
          if (
            fragment.startMs >= window.wrapUpMs ||
            fragment.endMs > window.wrapUpMs
          )
            break;
          boundary += fragment.text.length;
        }
        // Trailing whitespace belongs to the preceding sentence in Segmenter.
        // Find the sentence containing the next content, including punctuation,
        // and move its opening words with it even if those arrived earlier.
        const contentOffset = text.slice(boundary).search(/\S/u);
        // Live can omit the separator between a finished acknowledgement and
        // the next sentence ("that.What"). Segmenter joins those sentences;
        // retain the timed boundary without rewriting the provider's text.
        // A numeric continuation ("2." + "5") is not a new sentence.
        if (
          /[.!?]$/u.test(text.slice(0, boundary)) &&
          /^\p{Lu}/u.test(text.slice(boundary))
        )
          replyEnd = boundary;
        else if (contentOffset !== -1) {
          const sentenceStart =
            sentenceSegmenter.segment(text).containing(boundary + contentOffset)
              ?.index ?? text.length;
          // An unpunctuated acknowledgement, or one fragment overlapping the
          // context timestamp, can make Segmenter return zero for everything.
          // Keep whole fragments that began before the timestamp instead of
          // erasing an already-visible reply card.
          replyEnd =
            sentenceStart === 0 && timedReplyEnd > 0
              ? timedReplyEnd
              : sentenceStart;
        }
      }
      for (const kind of ["reply", "wrapUp"] as const) {
        this.#caption(window.id, kind, {
          text:
            kind === "reply" ? text.slice(0, replyEnd) : text.slice(replyEnd),
          state:
            window.closed || (kind === "reply" && window.wrapUpMs !== undefined)
              ? "done"
              : "streaming",
        });
      }
    }
  }
}
