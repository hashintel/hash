import type { GetResultsFromCancelledInferenceRequestQuery } from "@local/hash-isomorphic-utils/ai-inference-types";
import { defineQuery } from "@temporalio/workflow";

export const getResultsFromCancelledInferenceQuery: GetResultsFromCancelledInferenceRequestQuery =
  defineQuery("getResultsFromCancelledInference");
