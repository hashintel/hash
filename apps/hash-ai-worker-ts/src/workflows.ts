import { proxyActivities, sleep } from "@temporalio/workflow";

import * as activities from "./activities";

const { complete } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

export const DemoWorkflow = async (prompt: string): Promise<string> => {
  // Demonstrate sleeping, obviously we don't want this here in real workflows
  await sleep(50);

  // Call the activity
  return await complete(prompt);
};
