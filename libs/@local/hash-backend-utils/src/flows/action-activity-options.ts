import { ActivityCancellationType } from "@temporalio/workflow";

import {
  actionDefinitions,
  aiActionDefinitions,
} from "@local/hash-isomorphic-utils/flows/action-definitions";

import type { FlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/types";
import type { ActivityOptions } from "@temporalio/workflow";

/**
 * The Temporal options for running an action's activity: on the task queue of the worker that implements the action,
 * which registers the actions of its group (`aiActionDefinitions` or `integrationActionDefinitions`), with its
 * definition's `activitySettings`.
 *
 * Note that, for an action that heartbeats:
 *  - it learns that its run was cancelled or closed by catching `Context.current().cancelled`;
 *  - it only learns it when its next heartbeat is processed, so it should heartbeat often;
 *  - heartbeats are throttled to 80% of the heartbeat timeout by default, so a heartbeat isn't processed when it's sent
 *    (`maxHeartbeatThrottleInterval` in the worker's options, 60 seconds by default, also applies).
 */
export const getActionActivityOptions = (
  actionDefinitionId: FlowActionDefinitionId,
): Required<
  Pick<
    ActivityOptions,
    "taskQueue" | "startToCloseTimeout" | "cancellationType"
  >
> &
  Pick<ActivityOptions, "heartbeatTimeout"> => {
  const {
    startToCloseTimeoutSeconds,
    heartbeatTimeoutSeconds,
    handlesCancellation,
  } = actionDefinitions[actionDefinitionId].activitySettings;

  return {
    taskQueue: Object.hasOwn(aiActionDefinitions, actionDefinitionId)
      ? "ai"
      : "integration",
    startToCloseTimeout: `${startToCloseTimeoutSeconds} second`,
    heartbeatTimeout:
      heartbeatTimeoutSeconds === undefined
        ? undefined
        : `${heartbeatTimeoutSeconds} second`,
    cancellationType: handlesCancellation
      ? ActivityCancellationType.WAIT_CANCELLATION_COMPLETED
      : ActivityCancellationType.ABANDON,
  };
};
