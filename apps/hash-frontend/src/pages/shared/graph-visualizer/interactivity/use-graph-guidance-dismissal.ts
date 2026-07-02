/** First-visit guidance card persistence via localStorage. */
import { useCallback, useEffect, useState } from "react";

const GRAPH_GUIDANCE_DISMISSED_KEY =
  "hash.graph-visualizer-v2.guidance-dismissed";

/**
 * Tracks whether the first-visit guidance card should show, persisting dismissal
 * across sessions under the `GRAPH_GUIDANCE_DISMISSED_KEY` localStorage key.
 *
 * `shouldShowGuidance` starts `false` and flips after the initial effect reads
 * localStorage, so the card never flashes on for a returning user during hydration.
 */
export function useGraphGuidanceDismissal(): {
  readonly shouldShowGuidance: boolean;
  readonly dismissGuidance: () => void;
} {
  const [shouldShowGuidance, setShouldShowGuidance] = useState(false);

  useEffect(() => {
    setShouldShowGuidance(
      window.localStorage.getItem(GRAPH_GUIDANCE_DISMISSED_KEY) !== "true",
    );
  }, []);

  const dismissGuidance = useCallback(() => {
    window.localStorage.setItem(GRAPH_GUIDANCE_DISMISSED_KEY, "true");
    setShouldShowGuidance(false);
  }, []);

  return { shouldShowGuidance, dismissGuidance };
}
