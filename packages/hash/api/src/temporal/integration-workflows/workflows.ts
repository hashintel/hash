import * as wf from "@temporalio/workflow";
// Only import the activity types
import type * as activities from "./integrationActivities";

export const configureIntegrationSignal = wf.defineSignal<
  [activities.IntegrationConfigAction]
>("configureIntegration");
export const startIntegrationSignal = wf.defineSignal("startIntegration");
export const integrationStateQuery =
  wf.defineQuery<activities.IntegrationState>("integrationState");

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;

// examples
// See https://github.com/temporalio/samples-typescript/tree/main/signals-queries/src
// export const unblockSignal = wf.defineSignal("unblock");
// export const isBlockedQuery = wf.defineQuery<boolean>("isBlocked");

const act = wf.proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

/** A workflow that manages the set-up of an integration */
export async function manageIntegration(
  integrationName: string,
): Promise<void> {
  const state: activities.IntegrationState = {
    integrationName,
    enabled: false,
    configuredFields: {},
  };

  wf.setHandler(integrationStateQuery, () => state);
  wf.setHandler(configureIntegrationSignal, (action) => {
    if (action.type === "configureFields") {
      const { fields } = action.configureFields;
      for (const key in fields) {
        if (
          state.configuredFields[key] != null ||
          state.configuredFields[key]?.currentValue !== fields[key]
        ) {
          state.configuredFields[key] = {
            currentValue: fields[key],
            updatedAtISO: action.configureFields.updateAtISO,
          };
        }
      }
    } else if (action.type === "enable") {
      state.enabled = action.enable;
    } else {
      // exhaustive check
      const _: never = action;
    }
  });

  let requestedToPerformIntegration = false;
  wf.setHandler(startIntegrationSignal, async () => {
    requestedToPerformIntegration = true;
  });

  try {
    while (true) {
      // Progress 1/10: Haven't thought very deeply about cron vs condition with timeout. Just learning.
      // while loop keeps this integration workflow active (so it never resolves, so we can perform the integration at any point)
      if (await wf.condition(() => requestedToPerformIntegration, 24 * HOUR)) {
        requestedToPerformIntegration = false;
        await act.performIntegration(state);
      } else {
        // 24 hours have passed without integration...
      }
    }
  } catch (err) {
    if (err instanceof wf.CancelledFailure) {
      console.error(`Integration "${state.integrationName}" cancelled`);
    }
    throw err;
  }
}
