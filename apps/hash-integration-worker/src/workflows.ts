import { proxyActivities } from "@temporalio/workflow";

import { createIntegrationActivities } from "./activities";

export const { helloWorldActivity } = proxyActivities<
  ReturnType<typeof createIntegrationActivities>
>({
  startToCloseTimeout: "180 second",
  retry: {
    maximumAttempts: 3,
  },
});
export const helloWorldWorkflow = async (params: {}): Promise<String> =>
  await helloWorldActivity(params);
