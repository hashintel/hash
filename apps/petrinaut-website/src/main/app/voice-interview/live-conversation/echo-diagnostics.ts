import { logLiveDiagnostic } from "../shared/live-diagnostic";

/**
 * Speech starting up to this long after the last audible output sample still
 * overlaps it: room reverberation plus provider event delivery. Output
 * transcript fragments further apart than this start a new output span.
 */
const echoTailMs = 1_000;

const settingValue = (value: unknown) =>
  typeof value === "boolean" || typeof value === "string" ? value : undefined;

const meanDb = (total: number, samples: number) =>
  samples > 0 ? Math.round((total / samples) * 10) / 10 : undefined;

/** Browsers may apply less processing than the capture requested. */
export const logCaptureSettings = (
  sessionId: string,
  stream: MediaStream,
  reason: "started" | "microphone-switched",
): void => {
  let settings: {
    readonly autoGainControl?: unknown;
    readonly echoCancellation?: unknown;
    readonly noiseSuppression?: unknown;
  } = {};
  try {
    settings = stream.getAudioTracks()[0]?.getSettings() ?? {};
  } catch {
    // Optional telemetry must not affect the session lifetime.
  }
  logLiveDiagnostic("capture.settings", {
    sessionId,
    reason,
    echoCancellation: settingValue(settings.echoCancellation),
    noiseSuppression: settingValue(settings.noiseSuppression),
    autoGainControl: settingValue(settings.autoGainControl),
  });
};

interface OutputSample {
  readonly audible: boolean;
  readonly microphoneLevel: number;
  readonly echoReturnLoss: number | undefined;
  readonly echoReturnLossEnhancement: number | undefined;
  readonly microphoneMuted: boolean;
  readonly speakerMuted: boolean;
  readonly speakerVolume: number;
  readonly selectedSpeaker: boolean;
}

interface OutputStretch {
  readonly startedAt: number;
  lastAudibleAt: number;
  peakMicrophoneLevel: number;
  echoSamples: number;
  echoReturnLossTotal: number;
  echoReturnLossEnhancementTotal: number;
  transcriptionSpeechStarts: number;
  liveInputFragments: number;
  microphoneMuted: boolean;
  speakerMuted: boolean;
  speakerVolume: number;
  selectedSpeaker: boolean;
}

/** Echo evidence per stretch of audible Live output, never audio or text. */
export const createOutputEchoTrace = (sessionId: string) => {
  let stretch: OutputStretch | undefined;
  let liveOutputFragments = 0;
  let liveOutputSpan: { startMs: number; endMs: number } | undefined;
  const startedDuringOutput = new Set<string>();

  const report = (sessionEnded: boolean) => {
    if (!stretch) return;
    logLiveDiagnostic("echo.output", {
      sessionId,
      sessionEnded,
      outputMs: stretch.lastAudibleAt - stretch.startedAt,
      microphoneMuted: stretch.microphoneMuted,
      speakerMuted: stretch.speakerMuted,
      speakerVolume: stretch.speakerVolume,
      selectedSpeaker: stretch.selectedSpeaker,
      peakMicrophoneLevel: Math.round(stretch.peakMicrophoneLevel * 100) / 100,
      echoSamples: stretch.echoSamples,
      echoReturnLossDb: meanDb(
        stretch.echoReturnLossTotal,
        stretch.echoSamples,
      ),
      echoReturnLossEnhancementDb: meanDb(
        stretch.echoReturnLossEnhancementTotal,
        stretch.echoSamples,
      ),
      transcriptionSpeechStarts: stretch.transcriptionSpeechStarts,
      liveOutputFragments,
      liveInputFragments: stretch.liveInputFragments,
    });
    stretch = undefined;
    liveOutputFragments = 0;
  };

  return {
    sample: (at: number, sample: OutputSample): void => {
      if (sample.audible) {
        stretch ??= {
          startedAt: at,
          lastAudibleAt: at,
          peakMicrophoneLevel: 0,
          echoSamples: 0,
          echoReturnLossTotal: 0,
          echoReturnLossEnhancementTotal: 0,
          transcriptionSpeechStarts: 0,
          liveInputFragments: 0,
          microphoneMuted: false,
          speakerMuted: false,
          speakerVolume: sample.speakerVolume,
          selectedSpeaker: sample.selectedSpeaker,
        };
        stretch.lastAudibleAt = at;
      }
      if (!stretch) return;
      if (at - stretch.lastAudibleAt >= echoTailMs) {
        report(false);
        return;
      }
      stretch.peakMicrophoneLevel = Math.max(
        stretch.peakMicrophoneLevel,
        sample.microphoneLevel,
      );
      if (
        sample.echoReturnLoss !== undefined &&
        sample.echoReturnLossEnhancement !== undefined
      ) {
        stretch.echoSamples++;
        stretch.echoReturnLossTotal += sample.echoReturnLoss;
        stretch.echoReturnLossEnhancementTotal +=
          sample.echoReturnLossEnhancement;
      }
      stretch.microphoneMuted ||= sample.microphoneMuted;
      stretch.speakerMuted ||= sample.speakerMuted;
      stretch.speakerVolume = sample.speakerVolume;
      stretch.selectedSpeaker = sample.selectedSpeaker;
    },
    transcriptionSpeechStarted: (itemId: unknown): void => {
      if (!stretch) return;
      stretch.transcriptionSpeechStarts++;
      if (typeof itemId === "string") startedDuringOutput.add(itemId);
    },
    liveOutputFragment: (startMs: unknown, endMs: unknown): void => {
      liveOutputFragments++;
      if (typeof startMs !== "number" || typeof endMs !== "number") return;
      if (!liveOutputSpan || startMs - liveOutputSpan.endMs > echoTailMs)
        liveOutputSpan = { startMs, endMs };
      else liveOutputSpan.endMs = Math.max(liveOutputSpan.endMs, endMs);
    },
    liveInputFragment: (startMs: unknown): void => {
      // A late fragment of the person's own turn starts before this output did.
      if (
        stretch &&
        liveOutputSpan &&
        typeof startMs === "number" &&
        startMs >= liveOutputSpan.startMs
      )
        stretch.liveInputFragments++;
    },
    startedDuringOutput: (itemId: string): boolean =>
      startedDuringOutput.has(itemId),
    end: (): void => report(true),
  };
};
