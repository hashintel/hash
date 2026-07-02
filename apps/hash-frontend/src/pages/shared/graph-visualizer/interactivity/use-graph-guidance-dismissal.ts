import { useCallback, useEffect, useState } from "react";

const GRAPH_GUIDANCE_DISMISSED_KEY =
  "hash.graph-visualizer-v2.guidance-dismissed";

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
