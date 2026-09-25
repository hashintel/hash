export interface TranscriptionConfidence {
  readonly logprobTokens: number;
  readonly meanLogprob?: number;
  readonly minLogprob?: number;
}

const rounded = (value: number) => Math.round(value * 1000) / 1000;

/** Reads only each entry's `logprob`; tokens and bytes are transcript text. */
export const summarizeLogprobs = (
  logprobs: unknown,
): TranscriptionConfidence => {
  const values = Array.isArray(logprobs)
    ? logprobs.flatMap((entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "logprob" in entry &&
        typeof entry.logprob === "number" &&
        Number.isFinite(entry.logprob)
          ? [entry.logprob]
          : [],
      )
    : [];
  if (values.length === 0) return { logprobTokens: 0 };
  return {
    logprobTokens: values.length,
    meanLogprob: rounded(
      values.reduce((total, value) => total + value, 0) / values.length,
    ),
    minLogprob: rounded(
      values.reduce((lowest, value) => Math.min(lowest, value), Infinity),
    ),
  };
};
