import { InferredEntityChangeResult } from "@local/hash-isomorphic-utils/ai-inference-types";

import { InferenceState } from "./inference-types";

export const getResultsFromInferenceState = (inferenceState: InferenceState) =>
  Object.values(inferenceState.resultsByTemporaryId).filter(
    (result): result is InferredEntityChangeResult =>
      result.status !== "update-candidate",
  );
