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

/**
 * A workflow that manages the set-up & execution of an integration.
 *
 * Progress -1/10:
 * This is a nice proof-of-concet showing how Temporal can make it dead-easy to maintain persistent
 * state, but ultimately, this should probably be split apart into different workflows, and potentially
 * split into just a work flow for executing integrations, and then to do the actual IntegrationState CRUD
 * as a part of normal models and postgresql fashion.
 *
 * As this is, it might be enough to cross a finish line and come back in when a major extension needs to
 * be made, or if there are unexplainable issues that crop up often (e.g. see "Workers and availability" below).
 *
 * ## Workers and availability
 *
 * Workers need to be registered against temporal server to become available to process requests and steal work
 * from the task queue. Task queues currently get added to when GraphQL queries are made to query integrations
 * because we use a Temporal query to check on the integration's state this way. This means that in `yarn dev`,
 * when the `dev:temporal-worker` script restarts, it may end up holding up graphql queries made shortly after
 * file changes causing the temporal-worker to restart it's process.
 *
 * You can check worker availabilites in dev at an endpoint like http://localhost:8088/namespaces/default/task-queues/integrations-queue
 */
export async function manageIntegration(
  integrationName: string,
): Promise<void> {
  const state: activities.IntegrationState = {
    integrationName,
    enabled: false,
    configuredFields: {},
    performances: [],
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
    /*
    RE: Concern on while(true) loop & this "indefinite" workflow

    From https://docs.temporal.io/docs/concepts/what-is-a-workflow-execution/

    > Workflows intended to run indefinitely should be written with some care.
    > Temporal stores the complete event history for the entire lifecycle of a
    > Workflow Execution. There is a maximum limit of 50,000 events that is
    > enforced by the Server, and you should try to avoid getting close to this
    > limit; The Temporal Server puts out a warning at every 10,000 events.

    Now, we are not expecting tens-of-thousands of events (i.e. config changes + performances)
    in our early stages. So, perhaps this is a good follow-up, but it might not be strictly required
    for an MVP of integrations.

    Consider that changing the layout/order of a workflow might require also changing the name of the workflow
    so that old versions of the execution don't get run?
    https://docs.temporal.io/docs/typescript/troubleshooting#stale-workflows
    Might be some interesting questions needing answering in regards to blue-green worker deployment, as well.
    */
    while (true) {
      // Progress 1/10: Haven't thought very deeply about cron vs condition with timeout. Just learning.
      // while loop keeps this integration workflow active (so it never resolves, so we can perform the integration at any point)
      await wf.condition(() => requestedToPerformIntegration);
      requestedToPerformIntegration = false;

      const performance = await act.createNewPerformance();
      state.performances.push(performance);
      try {
        const { durationMs, result } = await act.performIntegration(state);
        performance.settled = {
          durationMs,
          ok: result.ok,
          message: result.ok
            ? `${result.inserts} inserts, ${result.updates} updates`
            : result.message,
          details: result.ok ? undefined : result.details,
        };
      } catch (err) {
        if (err instanceof wf.ActivityFailure) {
          // ? Indicate that the integration performance actually failed?
          performance.settled = {
            durationMs: -1, // might want to actually calculat the duration as an activity
            ok: false,
            message: "Internal error",
            details: "Workflow activity execution failure",
          };
        } else {
          throw err;
        }
      }

      // for example, cancel any requests that were made in the middle of this integration...
      requestedToPerformIntegration = false;
    }
  } catch (err) {
    if (err instanceof wf.CancelledFailure) {
      console.error(`Integration "${state.integrationName}" cancelled`);
    }
    throw err;
  }
}
