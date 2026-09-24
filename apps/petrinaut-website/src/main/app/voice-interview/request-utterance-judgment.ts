import { isUtteranceJudgment } from "../../../shared/live-utterance-judgment";

import type {
  UtteranceJudgment,
  UtteranceJudgmentState,
} from "../../../shared/live-utterance-judgment";

/** Log-only measurement window for the latency tail, not an enforcement deadline. */
const utteranceJudgmentTimeoutMs = 10_000;

/** One request, no retry. The enforcement gate supplies its shorter abort deadline. */
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
