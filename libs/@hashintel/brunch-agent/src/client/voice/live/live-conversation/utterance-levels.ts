/**
 * Speech starts are reported after the speech began, so a short utterance can
 * be over before its start arrives. Samples this long before the reported
 * start count toward the utterance.
 */
const speechLookbackMs = 1_000;

/** Peak microphone level per transcription utterance, never audio or text. */
export const createUtteranceLevels = () => {
  let recent: readonly { readonly at: number; readonly level: number }[] = [];
  const peaks = new Map<string, number>();
  let speakingItemId: string | undefined;

  return {
    sample: (at: number, level: number): void => {
      recent = [
        ...recent.filter((entry) => at - entry.at <= speechLookbackMs),
        { at, level },
      ];
      if (speakingItemId !== undefined)
        peaks.set(
          speakingItemId,
          Math.max(peaks.get(speakingItemId) ?? 0, level),
        );
    },
    speechStarted: (itemId: unknown, at: number): void => {
      if (typeof itemId !== "string") return;
      speakingItemId = itemId;
      peaks.set(
        itemId,
        recent.reduce(
          (peak, entry) =>
            at - entry.at <= speechLookbackMs
              ? Math.max(peak, entry.level)
              : peak,
          0,
        ),
      );
    },
    speechStopped: (itemId: unknown): void => {
      if (itemId === speakingItemId) speakingItemId = undefined;
    },
    peak: (itemId: string): number | undefined => {
      const peak = peaks.get(itemId);
      return peak === undefined ? undefined : Math.round(peak * 100) / 100;
    },
    forget: (itemId: string): void => {
      peaks.delete(itemId);
    },
  };
};
