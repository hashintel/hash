import type { ProxyFlowActivity } from "@local/hash-backend-utils/flows";
import { processFlowWorkflow } from "@local/hash-backend-utils/flows/process-flow-workflow";
import { type AiFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  RunAiFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowDefinition,
  FlowTrigger,
} from "@local/hash-isomorphic-utils/flows/types";
import {
  ActivityCancellationType,
  proxyActivities,
} from "@temporalio/workflow";

import type { createFlowActivities } from "../activities/flow-activities.js";
import { heartbeatTimeoutSeconds } from "../shared/heartbeats.js";
import { setQueryAndSignalHandlers } from "./run-flow-workflow/set-query-and-signal-handlers.js";

type FlowActivityId = keyof ReturnType<typeof createFlowActivities>;

/**
 * Activities which handle cancellation gracefully, i.e.
 * - the activity sends a frequent heartbeat to ensure it is known to be still running
 * - the activity catches the cancellation error (Context.current().cancelled) and re-throws it after any cleanup
 * - [ideally] the activity has checks for cancellation at appropriate points in its execution and bails out of work
 * - [ideally] the activity includes state with its heartbeat and checks the lastHeartbeatDetails to resume from previous state
 */
const activitiesHandlingCancellation: FlowActivityId[] = [
  "researchEntitiesAction",
];

const activitiesHeartbeating: FlowActivityId[] = [
  ...activitiesHandlingCancellation,
  "persistEntitiesAction",
];

const proxyFlowActivity: ProxyFlowActivity<
  AiFlowActionDefinitionId,
  typeof createFlowActivities
> = (params) => {
  const { actionName, maximumAttempts, activityId } = params;

  const { [actionName]: action } = proxyActivities<
    ReturnType<typeof createFlowActivities>
  >({
    cancellationType: activitiesHandlingCancellation.includes(actionName)
      ? ActivityCancellationType.WAIT_CANCELLATION_COMPLETED
      : ActivityCancellationType.ABANDON,

    startToCloseTimeout: activitiesHeartbeating.includes(actionName)
      ? /**
         * @todo H-3129 – research tasks can take a long time, and waiting for user input takes an indefinite amount of time.
         *    - we need to be able to sleep at the workflow level and have activities that take a bounded, shorter amount of time.
         *    this involves refactoring actions which run a long time or wait for user input to be child workflows instead.
         */
        "36000 second" // 10 hours
      : /**
         * If an activity doesn't heartbeat and handle cancellation, we assume it doesn't need long to complete
         * @todo make more activities handle cancellation and lower this
         */
        "300 second", // 5 minutes
    /**
     * The heartbeat timeout is the time elapsed without a heartbeat after which the activity is considered to have failed.
     * Note that:
     *  - heartbeat-ing activities can receive notification when a flow is cancelled/closed, by catching Context.current().cancelled
     *  - notification will only be received when the next heartbeat is processed, and so the activity should heartbeat frequently
     *  - heartbeats are throttled by default to 80% of the heartbeatTimeout, so sending a heartbeat does not mean it will be processed then
     *  - maxHeartbeatThrottleInterval can be set in WorkerOptions, and otherwise defaults to 60s
     */
    heartbeatTimeout: activitiesHeartbeating.includes(actionName)
      ? `${heartbeatTimeoutSeconds} second`
      : undefined,
    retry: { maximumAttempts },
    activityId,
  });

  return action;
};

const generateFlowRunName = (params: {
  flowDefinition: FlowDefinition<AiFlowActionDefinitionId>;
  flowTrigger: FlowTrigger;
}) => {
  const { flowDefinition, flowTrigger } = params;

  const { generateFlowRunName: generateFlowRunNameActivity } = proxyActivities<
    ReturnType<typeof createFlowActivities>
  >({
    startToCloseTimeout: "60 second",
    retry: { maximumAttempts: 1 },
  });

  return generateFlowRunNameActivity({ flowDefinition, flowTrigger });
};

export const runFlowWorkflow = async (
  params: RunAiFlowWorkflowParams,
): Promise<RunFlowWorkflowResponse> => {
  setQueryAndSignalHandlers();

  return await processFlowWorkflow({
    ...params,
    flowType: "ai",
    proxyFlowActivity,
    generateFlowRunName,
  });
};
