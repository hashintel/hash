import {
  classifyInterruption,
  tokensOf,
} from "../../../shared/classify-interruption";

const containsRun = (
  tokens: readonly string[],
  reference: readonly string[],
): boolean => {
  for (let start = 0; start + tokens.length <= reference.length; start++) {
    if (tokens.every((token, offset) => reference[start + offset] === token)) {
      return true;
    }
  }
  return false;
};

/** Only meaningful for speech that overlapped Live's audible output. */
export const repeatsLiveOutput = (
  transcript: string,
  liveOutputText: string,
): boolean => {
  const tokens = tokensOf(transcript);
  // Below six tokens classifyInterruption only matches a whole repeat.
  if (tokens.length >= 6) {
    return classifyInterruption(transcript, [liveOutputText]) === "self-echo";
  }
  return tokens.length > 0 && containsRun(tokens, tokensOf(liveOutputText));
};
