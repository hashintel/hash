import type { InferEntitiesCallerParams } from "@local/hash-isomorphic-utils/ai-inference-types";
import { proxyActivities } from "@temporalio/workflow";

import { createAiActivities } from "./activities";

const aiActivities = proxyActivities<ReturnType<typeof createAiActivities>>({
  startToCloseTimeout: "3600 second", // 1 hour
  retry: {
    maximumAttempts: 1,
  },
});

export const inferEntities = (params: InferEntitiesCallerParams) =>
  aiActivities.inferEntitiesActivity(params);
