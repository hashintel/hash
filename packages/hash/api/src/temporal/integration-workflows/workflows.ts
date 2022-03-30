import * as wf from "@temporalio/workflow";
// Only import the activity types
import type * as activities from "./integrationActivities";

export const configureIntegrationSignal = wf.defineSignal<
  [activities.IntegrationConfigAction]
>("configureIntegration");
export const integrationStateQuery =
  wf.defineQuery<activities.IntegrationSetupState>("integrationState");

// examples
// See https://github.com/temporalio/samples-typescript/tree/main/signals-queries/src
// export const unblockSignal = wf.defineSignal("unblock");
// export const isBlockedQuery = wf.defineQuery<boolean>("isBlocked");

const { startIntegrationSetup } = wf.proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

/** A workflow that manages the set-up of an integration */
export async function manageIntegration(name: string): Promise<string> {
  let state: activities.IntegrationSetupState = {
    type: "init",
    name,
    init: {},
  };
  wf.setHandler(integrationStateQuery, () => state);
  state = await startIntegrationSetup(name);

  wf.setHandler(configureIntegrationSignal, (a) => {
    // configure the workflow?
  });

  return "Good job!";
}
