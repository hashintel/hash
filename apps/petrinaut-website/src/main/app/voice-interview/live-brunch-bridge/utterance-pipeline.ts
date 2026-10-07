import { logLiveDiagnostic } from "../shared/live-diagnostic";
import { repeatsLiveOutput } from "./utterance-pipeline/repeats-live-output";
import {
  isControlOnly,
  isFillerOnly,
} from "./utterance-pipeline/spoken-phrases";

import type { FinalizedInput } from "../live-conversation";

export type SkipReason =
  | "echo"
  | "doubtful-short-during-output"
  | "filler"
  | "control"
  | "short-during-output"
  | "empty";

export interface Utterance {
  readonly inputId: string;
  readonly text: string;
  /** Contractions such as "I'll" count as one word. */
  readonly words: number;
  readonly startedDuringOutput: boolean;
  /** Live's words around the speech, only when it overlapped audible output. Never traced. */
  readonly liveOutputText: string | undefined;
  /** The transcript's lowest per-token log probability, when any were returned. */
  readonly minLogprob: number | undefined;
}

export interface UtteranceStage {
  readonly reason: SkipReason;
  /** A shadow stage traces what it would skip and never decides. */
  readonly mode: "on" | "shadow" | "off";
  readonly skips: (utterance: Utterance) => boolean;
}

export const doubtfulBelowLogprob = -1.9;

const repeatsOverlappingOutput = ({ text, liveOutputText }: Utterance) =>
  liveOutputText !== undefined && repeatsLiveOutput(text, liveOutputText);

const isShortDuringOutput = ({ startedDuringOutput, words }: Utterance) =>
  startedDuringOutput && words > 0 && words <= 3;

/** Shadow stages come before active ones: a stage after a skip never runs. */
export const liveUtteranceStages: readonly UtteranceStage[] = [
  // Leaked Live audio can finalize as a longer repeat of Live's own words.
  {
    reason: "echo",
    mode: "shadow",
    skips: repeatsOverlappingOutput,
  },
  // Only short speech during output that also looks invented or repeats Live;
  // a shadow stage must run before the on stage that skips the same input.
  {
    reason: "doubtful-short-during-output",
    mode: "shadow",
    skips: (utterance) =>
      isShortDuringOutput(utterance) &&
      ((utterance.minLogprob !== undefined &&
        utterance.minLogprob < doubtfulBelowLogprob) ||
        repeatsOverlappingOutput(utterance)),
  },
  // Word lists traced beside log mode's model judgments of the same input, so
  // the two can be compared before either decides anything.
  {
    reason: "filler",
    mode: "shadow",
    skips: ({ text }) => isFillerOnly(text),
  },
  {
    reason: "control",
    mode: "shadow",
    skips: ({ text }) => isControlOnly(text),
  },
  // Leaked Live audio finalizes as phantoms of a few words.
  {
    reason: "short-during-output",
    mode: "on",
    skips: isShortDuringOutput,
  },
  // Transcription can finalize noise as punctuation alone, such as ".".
  {
    reason: "empty",
    mode: "on",
    skips: ({ words }) => words === 0,
  },
];

const wordCount = (text: string) =>
  text
    .normalize("NFKC")
    .match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu)?.length ?? 0;

/** The first stage that is on and skips decides; otherwise the input is sent. */
export const routeUtterance = (
  input: FinalizedInput,
  stages: readonly UtteranceStage[],
): SkipReason | null => {
  const utterance: Utterance = {
    inputId: input.id,
    text: input.text,
    words: wordCount(input.text),
    startedDuringOutput: input.startedDuringOutput,
    liveOutputText: input.liveOutputText,
    minLogprob: input.minLogprob,
  };
  for (const stage of stages) {
    if (stage.mode === "off" || !stage.skips(utterance)) continue;
    if (stage.mode === "on") return stage.reason;
    logLiveDiagnostic("filter.shadow", {
      inputId: utterance.inputId,
      reason: stage.reason,
    });
  }
  return null;
};
