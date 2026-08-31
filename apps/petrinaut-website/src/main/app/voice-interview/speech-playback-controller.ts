import {
  createVoiceRequestId,
  VoiceError,
  VOICE_REQUEST_ID_HEADER,
  voiceDiagnosticOutcome,
  voiceDurationMs,
  voiceErrorFromResponse,
  type VoiceDiagnosticReporter,
  type VoiceErrorCode,
} from "../../../voice-diagnostics";
import {
  hashCanonicalSpeechText,
  type CanonicalSpeechSegment,
} from "./canonical-speech";

interface SpeechAudio {
  addEventListener(type: "ended" | "error", listener: () => void): void;
  pause(): void;
  play(): Promise<void>;
  removeEventListener(type: "ended" | "error", listener: () => void): void;
}

interface SpeechPlaybackDependencies {
  readonly createAudio: (source: string) => SpeechAudio;
  readonly createObjectURL: (blob: Blob) => string;
  readonly createRequestId?: () => string;
  readonly fetch: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly reportDiagnostic?: VoiceDiagnosticReporter;
  readonly revokeObjectURL: (url: string) => void;
}

interface SpeechPlaybackEvents {
  readonly onPlaying?: () => void;
}

interface ActiveAudio {
  cancel(reason: DOMException): void;
  readonly generation: number;
}

const fallbackError = (requestId: string): VoiceError =>
  new VoiceError("speech", "invalid-response", requestId);
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
    const requestId =
      this.#dependencies.createRequestId?.() ?? createVoiceRequestId();
    const requestStartedAt = this.#now();
    let requestReported = false;
    let playbackStartedAt: number | null = null;
    if (
      segment.contentHash !== hashCanonicalSpeechText(segment.text) ||
      !segment.id.endsWith(`:${segment.contentHash}`)
    ) {
      this.#reportDiagnostic(
        "browser",
        requestId,
        requestStartedAt,
        "invalid-response",
      );
      throw fallbackError(requestId);
    }
    const generation = this.#generation;
    const abortController = new AbortController();
    this.#abortController = abortController;

    try {
      let response: Response;
      try {
        response = await waitForAbort(
          this.#dependencies.fetch("/api/voice/speech", {
            body: JSON.stringify({
              segmentId: segment.id,
              text: segment.text,
            }),
            cache: "no-store",
            headers: {
              "content-type": "application/json",
              [VOICE_REQUEST_ID_HEADER]: requestId,
            },
            method: "POST",
            signal: abortController.signal,
          }),
          abortController.signal,
        );
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        throw new VoiceError("speech", "network", requestId);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw voiceErrorFromResponse(response, "speech", requestId);
      }
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== "audio/mpeg") {
        await response.body?.cancel();
        throw fallbackError(requestId);
      }

      let blob: Blob;
      try {
        blob = await waitForAbort(response.blob(), abortController.signal);
      } catch (error) {
        if (isAbortError(error)) {
          if (abortController.signal.aborted) {
            throw error;
          }
          throw new VoiceError("speech", "request-aborted", requestId);
        }
        throw new VoiceError("speech", "network", requestId);
      }
      if (generation !== this.#generation || blob.size === 0) {
        throw generation === this.#generation
          ? fallbackError(requestId)
          : abortError();
      }
      this.#reportDiagnostic("browser", requestId, requestStartedAt);
      requestReported = true;
      playbackStartedAt = this.#now();

      const objectUrl = this.#dependencies.createObjectURL(blob);
      let audio: SpeechAudio;
      try {
        audio = this.#dependencies.createAudio(objectUrl);
      } catch {
        this.#dependencies.revokeObjectURL(objectUrl);
        throw fallbackError(requestId);
      }
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
        const handleEnded = () =>
          settle(() => {
            this.#reportDiagnostic("playback", requestId, playbackStartedAt!);
            resolve();
          });
        const handleError = () =>
          settle(() => reject(fallbackError(requestId)));
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
      const errorCode = isAbortError(error)
        ? "request-aborted"
        : error instanceof VoiceError
          ? error.code
          : "invalid-response";
      if (!requestReported) {
        this.#reportDiagnostic(
          "browser",
          requestId,
          requestStartedAt,
          errorCode,
        );
      } else if (playbackStartedAt !== null) {
        this.#reportDiagnostic(
          "playback",
          requestId,
          playbackStartedAt,
          errorCode,
        );
      }
      if (isAbortError(error)) {
        throw error;
      }
      throw error instanceof VoiceError ? error : fallbackError(requestId);
    } finally {
      if (this.#abortController === abortController) {
        this.#abortController = null;
      }
    }
  }

  #now(): number {
    return this.#dependencies.now?.() ?? performance.now();
  }

  #reportDiagnostic(
    stage: "browser" | "playback",
    requestId: string,
    startedAt: number,
    errorCode?: VoiceErrorCode,
  ): void {
    this.#dependencies.reportDiagnostic?.({
      durationMs: voiceDurationMs(startedAt, this.#now()),
      ...(errorCode === undefined ? {} : { errorCode }),
      operation: "speech",
      outcome: voiceDiagnosticOutcome(errorCode),
      requestId,
      stage,
    });
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
