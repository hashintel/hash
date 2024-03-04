import type { InferredEntityChangeResult } from "@local/hash-isomorphic-utils/ai-inference-types";

import type { InferenceState } from "./inference-types";

export const getResultsFromInferenceState = (inferenceState: InferenceState) =>
  Object.values(inferenceState.resultsByTemporaryId).filter(
    (result): result is InferredEntityChangeResult =>
      result.status !== "update-candidate",
  );
