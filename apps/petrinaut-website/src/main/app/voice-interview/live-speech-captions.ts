import type { VoiceLine } from "../../../shared/voice-mediation";

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

/**
 * Display grouping on Live's timeline, not a claim of response identity or
 * heard playback. Context-injection boundaries divide reply from wrap-up;
 * another input or session closure closes the group. No silence timeout.
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
          (window.endMs === undefined || fragment.endMs <= window.endMs),
      );
      for (const kind of ["reply", "wrapUp"] as const) {
        const text = matching
          .filter((fragment) =>
            kind === "reply"
              ? window.wrapUpMs === undefined ||
                fragment.startMs < window.wrapUpMs
              : window.wrapUpMs !== undefined &&
                fragment.startMs >= window.wrapUpMs,
          )
          .map((fragment) => fragment.text)
          .join("");
        this.#caption(window.id, kind, {
          text,
          state:
            window.closed || (kind === "reply" && window.wrapUpMs !== undefined)
              ? "done"
              : "streaming",
        });
      }
    }
  }
}
