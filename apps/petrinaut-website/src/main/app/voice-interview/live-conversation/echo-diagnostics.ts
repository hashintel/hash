import { logLiveDiagnostic } from "../shared/live-diagnostic";
import { echoTailMs } from "./shared/echo-tail";

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
  readonly selectedSpeaker: boolean;
}

interface OutputStretch {
  readonly startedAt: number;
  lastAudibleAt: number;
  peakMicrophoneLevel: number;
  echoReturnLossSamples: number;
  echoReturnLossTotal: number;
  echoReturnLossEnhancementSamples: number;
  echoReturnLossEnhancementTotal: number;
  transcriptionSpeechStarts: number;
  liveInputFragments: number;
  microphoneMuted: boolean;
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
      selectedSpeaker: stretch.selectedSpeaker,
      peakMicrophoneLevel: Math.round(stretch.peakMicrophoneLevel * 100) / 100,
      echoReturnLossSamples: stretch.echoReturnLossSamples,
      echoReturnLossDb: meanDb(
        stretch.echoReturnLossTotal,
        stretch.echoReturnLossSamples,
      ),
      echoReturnLossEnhancementSamples:
        stretch.echoReturnLossEnhancementSamples,
      echoReturnLossEnhancementDb: meanDb(
        stretch.echoReturnLossEnhancementTotal,
        stretch.echoReturnLossEnhancementSamples,
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
      if (stretch && at - stretch.lastAudibleAt >= echoTailMs) report(false);
      if (sample.audible) {
        stretch ??= {
          startedAt: at,
          lastAudibleAt: at,
          peakMicrophoneLevel: 0,
          echoReturnLossSamples: 0,
          echoReturnLossTotal: 0,
          echoReturnLossEnhancementSamples: 0,
          echoReturnLossEnhancementTotal: 0,
          transcriptionSpeechStarts: 0,
          liveInputFragments: 0,
          microphoneMuted: false,
          selectedSpeaker: sample.selectedSpeaker,
        };
        stretch.lastAudibleAt = at;
      }
      if (!stretch) return;
      stretch.peakMicrophoneLevel = Math.max(
        stretch.peakMicrophoneLevel,
        sample.microphoneLevel,
      );
      if (sample.echoReturnLoss !== undefined) {
        stretch.echoReturnLossSamples++;
        stretch.echoReturnLossTotal += sample.echoReturnLoss;
      }
      if (sample.echoReturnLossEnhancement !== undefined) {
        stretch.echoReturnLossEnhancementSamples++;
        stretch.echoReturnLossEnhancementTotal +=
          sample.echoReturnLossEnhancement;
      }
      stretch.microphoneMuted ||= sample.microphoneMuted;
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
