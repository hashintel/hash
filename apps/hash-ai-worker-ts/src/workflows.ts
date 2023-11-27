import type { InferEntitiesCallerParams } from "@local/hash-isomorphic-utils/temporal-types";
import { proxyActivities } from "@temporalio/workflow";

import { createAiActivities } from "./activities";

const aiActivities = proxyActivities<ReturnType<typeof createAiActivities>>({
  startToCloseTimeout: "600 second",
  retry: {
    maximumAttempts: 1,
  },
});

export const inferEntities = (params: InferEntitiesCallerParams) =>
  aiActivities.inferEntitiesActivity(params);
