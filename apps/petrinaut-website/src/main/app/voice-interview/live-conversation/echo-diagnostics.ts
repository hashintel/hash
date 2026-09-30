import { logLiveDiagnostic } from "../shared/live-diagnostic";

/**
 * An output stretch stays open this long after its last audible sample, for
 * room reverberation and provider event delivery. Output transcript fragments
 * further apart than this start a new output span.
 */
const echoTailMs = 1_000;

/**
 * Speech starts are reported after the speech began, so one reported this soon
 * after audible output can still be echo. A longer window drops quick answers.
 */
const speechOverlapMs = 500;

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
  /** Live audio is arriving and the speaker plays it: muted or silent output can't echo. */
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
  const sinceOutputMsByItem = new Map<string, number>();

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
    liveOutputSpan = undefined;
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
    transcriptionSpeechStarted: (itemId: unknown, at: number): void => {
      if (!stretch) return;
      stretch.transcriptionSpeechStarts++;
      if (typeof itemId === "string")
        sinceOutputMsByItem.set(itemId, at - stretch.lastAudibleAt);
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
    startedDuringOutput: (itemId: string): boolean => {
      const sinceOutputMs = sinceOutputMsByItem.get(itemId);
      return sinceOutputMs !== undefined && sinceOutputMs < speechOverlapMs;
    },
    /** Set only for speech starts reported while an output stretch was open. */
    sinceOutputMs: (itemId: string): number | undefined =>
      sinceOutputMsByItem.get(itemId),
    forget: (itemId: string): void => {
      sinceOutputMsByItem.delete(itemId);
    },
    end: (): void => report(true),
  };
};
