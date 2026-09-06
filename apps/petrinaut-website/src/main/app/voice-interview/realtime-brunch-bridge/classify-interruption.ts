import { voiceTranscriptionPrompt } from "../../../../shared/voice-transcription";

const tokensOf = (text: string): string[] =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);

const bigramsOf = (tokens: readonly string[]): string[] => {
  const bigrams: string[] = [];
  let previous: string | undefined;
  for (const token of tokens) {
    if (previous !== undefined) bigrams.push(`${previous} ${token}`);
    previous = token;
  }
  return bigrams;
};

const promptBigrams = bigramsOf(tokensOf(voiceTranscriptionPrompt));

/** Require matching adjacent words in reference order, not a bag of vocabulary. */
const hasStrongOrderedOverlap = (
  candidate: readonly string[],
  reference: readonly string[],
): boolean => {
  let matched = 0;
  let referenceOffset = 0;
  for (const bigram of candidate) {
    const position = reference.indexOf(bigram, referenceOffset);
    if (position !== -1) {
      matched++;
      referenceOffset = position + 1;
    }
  }
  return matched / candidate.length >= 0.8;
};

/** Comparison normalization never changes the admitted user's words. */
export const classifyInterruption = (
  transcript: string,
  canonicalPlaybackText: readonly string[],
): "prompt-regurgitation" | "self-echo" | null => {
  const tokens = tokensOf(transcript);
  // Short answers and isolated domain terms are not enough evidence of echo.
  if (tokens.length < 6) return null;
  const bigrams = bigramsOf(tokens);
  if (tokens.length >= 8 && hasStrongOrderedOverlap(bigrams, promptBigrams)) {
    return "prompt-regurgitation";
  }
  if (
    hasStrongOrderedOverlap(
      bigrams,
      bigramsOf(tokensOf(canonicalPlaybackText.join(" "))),
    )
  ) {
    return "self-echo";
  }
  return null;
};
