import type { BrunchWord } from "@hashintel/brunch-agent/words";

/** Shared by provider configuration and local completed-transcript admission. */
export const voiceTranscriptionPrompt =
  "Expect English process-modeling vocabulary including SDCPN, stochastic Petri net, place, transition, arc, token, marking, guard, rate, distribution, parameter, subnet, scenario, and metric.";

/**
 * The transcriber reads `prompt` as prior transcript context, not as
 * instructions, so the names are listed as plain speech-like text rather than
 * JSON or caveats. Spellings are already bounded single-line literals without
 * angle brackets or control characters.
 */
export const buildVoiceTranscriptionPrompt = (
  words: readonly BrunchWord[],
): string =>
  words.length === 0
    ? voiceTranscriptionPrompt
    : `${voiceTranscriptionPrompt} Also expect these names: ${words.map((word) => word.spelling).join(", ")}.`;
