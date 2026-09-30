import { logLiveDiagnostic } from "../shared/live-diagnostic";
import { repeatsLiveOutput } from "./utterance-pipeline/repeats-live-output";

import type { FinalizedInput } from "../live-conversation";

export type SkipReason = "echo" | "short-during-output" | "empty";

export interface Utterance {
  readonly inputId: string;
  readonly text: string;
  /** Contractions such as "I'll" count as one word. */
  readonly words: number;
  readonly startedDuringOutput: boolean;
  /** Live's words around the speech, only when it overlapped audible output. Never traced. */
  readonly liveOutputText: string | undefined;
}

export interface UtteranceStage {
  readonly name: string;
  /** A shadow stage traces what it would skip and never decides. */
  readonly mode: "on" | "shadow" | "off";
  readonly skip: (utterance: Utterance) => SkipReason | null;
}

/** Shadow stages come before active ones: a stage after a skip never runs. */
export const liveUtteranceStages: readonly UtteranceStage[] = [
  // Leaked Live audio can finalize as a longer repeat of Live's own words.
  {
    name: "echo",
    mode: "shadow",
    skip: ({ text, liveOutputText }) =>
      liveOutputText !== undefined && repeatsLiveOutput(text, liveOutputText)
        ? "echo"
        : null,
  },
  // Leaked Live audio finalizes as phantoms of a few words.
  {
    name: "short-during-output",
    mode: "on",
    skip: ({ startedDuringOutput, words }) =>
      startedDuringOutput && words > 0 && words <= 3
        ? "short-during-output"
        : null,
  },
  // Transcription can finalize noise as punctuation alone, such as ".".
  {
    name: "empty",
    mode: "on",
    skip: ({ words }) => (words === 0 ? "empty" : null),
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
  };
  for (const stage of stages) {
    if (stage.mode === "off") continue;
    const reason = stage.skip(utterance);
    if (reason === null) continue;
    if (stage.mode === "on") return reason;
    logLiveDiagnostic("filter.shadow", {
      inputId: utterance.inputId,
      stage: stage.name,
      reason,
    });
  }
  return null;
};
