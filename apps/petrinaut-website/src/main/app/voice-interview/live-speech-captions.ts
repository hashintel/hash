import type { VoiceLine } from "../../../shared/voice-mediation";

export interface LiveTranscriptFragment {
  readonly id: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}
type Window = {
  id?: string;
  startMs: number;
  endMs?: number;
  wrapUpMs?: number;
  closed: boolean;
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
  #waitingForInput = true;
  #pendingId?: string;
  #closed = false;

  public constructor(
    caption: (id: string, kind: "reply" | "wrapUp", line: VoiceLine) => void,
  ) {
    this.#caption = caption;
  }

  public speechStarted(): void {
    if (this.#closed) return;
    const previous = this.#windows.at(-1);
    if (previous) previous.closed = true;
    this.#waitingForInput = true;
    this.#pendingId = undefined;
    this.#publish();
  }
  public input(fragment: { startMs: number; endMs: number }): void {
    if (this.#closed || !this.#waitingForInput) return;
    const previous = this.#windows.at(-1);
    // Late input deltas never rewind an already established window.
    if (previous && fragment.startMs <= previous.startMs) return;
    if (previous) previous.endMs = fragment.startMs;
    this.#windows.push({
      startMs: fragment.startMs,
      id: this.#pendingId,
      closed: false,
    });
    this.#pendingId = undefined;
    this.#waitingForInput = false;
    this.#publish();
  }
  public begin(id: string): void {
    if (this.#closed) return;
    const window = this.#windows.at(-1);
    if (!this.#waitingForInput && window && !window.id) window.id = id;
    else this.#pendingId = id;
    this.#publish();
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
    for (const window of this.#windows) window.closed = true;
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
