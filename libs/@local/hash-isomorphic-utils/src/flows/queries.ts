import { defineQuery } from "@temporalio/workflow";

import type { GetResultsFromCancelledInferenceRequestQuery } from "../ai-inference-types.js";

export const getResultsFromCancelledInferenceQuery: GetResultsFromCancelledInferenceRequestQuery =
  defineQuery("getResultsFromCancelledInference");
