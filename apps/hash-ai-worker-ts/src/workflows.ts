import { Status } from "@local/status";
import { proxyActivities } from "@temporalio/workflow";

import { createAiActivities } from "./activities";
import { InferEntitiesCallerParams } from "./activities/infer-entities";

const aiActivities = proxyActivities<ReturnType<typeof createAiActivities>>({
  startToCloseTimeout: "600 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const inferEntities = (
  params: InferEntitiesCallerParams,
): Promise<Status<any[]>> => aiActivities.inferEntitiesActivity(params);
