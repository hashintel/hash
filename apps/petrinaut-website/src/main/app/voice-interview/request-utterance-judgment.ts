import { isUtteranceJudgment } from "../../../shared/live-utterance-judgment";

import type {
  UtteranceJudgment,
  UtteranceJudgmentState,
} from "../../../shared/live-utterance-judgment";

/** Provisional measurement bound, not an admission timer. Tune only after real traces. */
const utteranceJudgmentTimeoutMs = 1_000;

/** One request, no retry. Failure affects the diagnostic only, never Brunch. */
export const createUtteranceJudgmentRequester =
  (fetch: typeof globalThis.fetch) =>
  async (
    state: UtteranceJudgmentState,
    signal: AbortSignal,
  ): Promise<UtteranceJudgment | null> => {
    try {
      signal.throwIfAborted();
      const response = await fetch("/api/voice/utterance-judgment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(utteranceJudgmentTimeoutMs),
        ]),
      });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      return isUtteranceJudgment(body)
        ? { contribution: body.contribution, confidence: body.confidence }
        : null;
    } catch {
      return null;
    }
  };
