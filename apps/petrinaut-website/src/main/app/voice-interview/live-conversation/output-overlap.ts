import { echoTailMs } from "./shared/echo-tail";

/** Live's output transcript can arrive ahead of the audio it describes. */
const leadMs = 3_000;
const retentionMs = 120_000;

interface Stretch {
  readonly startedAt: number;
  lastAudibleAt: number;
}

interface SpeechWindow {
  readonly startedAt: number;
  stoppedAt?: number;
}

/**
 * Local receipt times of transcription speech against audible Live output.
 * Live's words stay in memory for the echo stage and never reach a trace.
 */
export const createOutputOverlap = () => {
  const stretches: Stretch[] = [];
  const liveWords: { readonly at: number; readonly text: string }[] = [];
  const speech = new Map<string, SpeechWindow>();

  const prune = (at: number) => {
    while (liveWords[0] && liveWords[0].at < at - retentionMs) {
      liveWords.shift();
    }
    while (stretches[0] && stretches[0].lastAudibleAt < at - retentionMs) {
      stretches.shift();
    }
  };

  return {
    sample: (at: number, audible: boolean): void => {
      if (!audible) return;
      const last = stretches.at(-1);
      if (last && at - last.lastAudibleAt < echoTailMs) {
        last.lastAudibleAt = at;
      } else {
        stretches.push({ startedAt: at, lastAudibleAt: at });
      }
      prune(at);
    },
    liveOutput: (at: number, text: unknown): void => {
      if (typeof text !== "string") return;
      liveWords.push({ at, text });
      prune(at);
    },
    speechStarted: (itemId: unknown, at: number): void => {
      if (typeof itemId === "string") speech.set(itemId, { startedAt: at });
    },
    speechStopped: (itemId: unknown, at: number): void => {
      if (typeof itemId !== "string") return;
      const speechWindow = speech.get(itemId);
      if (speechWindow) speechWindow.stoppedAt ??= at;
    },
    /** Live's words around the speech, only when it overlapped audible output. */
    finalize: (itemId: string, at: number): string | undefined => {
      const speechWindow = speech.get(itemId);
      speech.delete(itemId);
      if (!speechWindow) return undefined;
      const stoppedAt = speechWindow.stoppedAt ?? at;
      const overlapped = stretches.some(
        (stretch) =>
          speechWindow.startedAt <= stretch.lastAudibleAt + echoTailMs &&
          stoppedAt >= stretch.startedAt,
      );
      if (!overlapped) return undefined;
      return liveWords
        .filter(
          (fragment) =>
            fragment.at >= speechWindow.startedAt - leadMs &&
            fragment.at <= stoppedAt,
        )
        .map((fragment) => fragment.text)
        .join("");
    },
    /** Some speech has started and its transcript isn't finalized yet. */
    pending: (): boolean => speech.size > 0,
    clear: (): void => {
      stretches.length = 0;
      liveWords.length = 0;
      speech.clear();
    },
  };
};
