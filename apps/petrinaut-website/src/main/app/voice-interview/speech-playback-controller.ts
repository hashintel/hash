import {
  hashCanonicalSpeechText,
  type CanonicalSpeechSegment,
} from "./canonical-speech";

const SPEECH_ERROR_MESSAGE =
  "The response could not be spoken. Read the visible text instead.";

interface SpeechAudio {
  addEventListener(type: "ended" | "error", listener: () => void): void;
  pause(): void;
  play(): Promise<void>;
  removeEventListener(type: "ended" | "error", listener: () => void): void;
}

interface SpeechPlaybackDependencies {
  readonly createAudio: (source: string) => SpeechAudio;
  readonly createObjectURL: (blob: Blob) => string;
  readonly fetch: typeof globalThis.fetch;
  readonly revokeObjectURL: (url: string) => void;
}

interface SpeechPlaybackEvents {
  readonly onPlaying?: () => void;
}

interface ActiveAudio {
  cancel(reason: DOMException): void;
  readonly generation: number;
}

const fallbackError = (): Error => new Error(SPEECH_ERROR_MESSAGE);
const abortError = (): DOMException =>
  new DOMException("Speech playback was canceled.", "AbortError");

const waitForAbort = <Value>(
  promise: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> => {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const handleAbort = () => reject(signal.reason);
    signal.addEventListener("abort", handleAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
};

const isAbortError = (error: unknown): error is DOMException =>
  error instanceof DOMException && error.name === "AbortError";

export class SpeechPlaybackController {
  readonly #dependencies: SpeechPlaybackDependencies;
  #abortController: AbortController | null = null;
  #activeAudio: ActiveAudio | null = null;
  #generation = 0;

  public constructor(dependencies: SpeechPlaybackDependencies) {
    this.#dependencies = dependencies;
  }

  public async play(
    segment: CanonicalSpeechSegment,
    events: SpeechPlaybackEvents = {},
  ): Promise<void> {
    this.cancel();
    if (
      segment.contentHash !== hashCanonicalSpeechText(segment.text) ||
      !segment.id.endsWith(`:${segment.contentHash}`)
    ) {
      throw fallbackError();
    }
    const generation = this.#generation;
    const abortController = new AbortController();
    this.#abortController = abortController;

    try {
      const response = await waitForAbort(
        this.#dependencies.fetch("/api/voice/speech", {
          body: JSON.stringify({ segmentId: segment.id, text: segment.text }),
          cache: "no-store",
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: abortController.signal,
        }),
        abortController.signal,
      );
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (!response.ok || contentType !== "audio/mpeg") {
        await response.body?.cancel();
        throw fallbackError();
      }

      const blob = await waitForAbort(response.blob(), abortController.signal);
      if (generation !== this.#generation || blob.size === 0) {
        throw generation === this.#generation ? fallbackError() : abortError();
      }

      const objectUrl = this.#dependencies.createObjectURL(blob);
      const audio = this.#dependencies.createAudio(objectUrl);
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let cleanup = () => undefined;
        const settle = (finish: () => void) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          finish();
        };
        const handleEnded = () => settle(resolve);
        const handleError = () => settle(() => reject(fallbackError()));
        cleanup = () => {
          audio.removeEventListener("ended", handleEnded);
          audio.removeEventListener("error", handleError);
          this.#dependencies.revokeObjectURL(objectUrl);
          if (this.#activeAudio?.generation === generation) {
            this.#activeAudio = null;
          }
        };
        this.#activeAudio = {
          cancel: (reason) => {
            audio.pause();
            settle(() => reject(reason));
          },
          generation,
        };
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        void audio.play().then(() => {
          if (!settled && generation === this.#generation) {
            events.onPlaying?.();
          }
        }, handleError);
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw fallbackError();
    } finally {
      if (this.#abortController === abortController) {
        this.#abortController = null;
      }
    }
  }

  public cancel(): void {
    ++this.#generation;
    const reason = abortError();
    this.#abortController?.abort(reason);
    this.#abortController = null;
    this.#activeAudio?.cancel(reason);
    this.#activeAudio = null;
  }
}
