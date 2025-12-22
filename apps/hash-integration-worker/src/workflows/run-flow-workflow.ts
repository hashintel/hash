import {
  processFlowWorkflow,
  type ProxyFlowActivity,
} from "@local/hash-backend-utils/flows";
import type { IntegrationFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  BaseRunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import {
  ActivityCancellationType,
  proxyActivities,
} from "@temporalio/workflow";

import type { createFlowActivities } from "../activities/flow-activities.js";

const proxyFlowActivity: ProxyFlowActivity<
  IntegrationFlowActionDefinitionId,
  typeof createFlowActivities
> = (params) => {
  const { actionName, maximumAttempts, activityId } = params;

  const { [actionName]: action } = proxyActivities<
    ReturnType<typeof createFlowActivities>
  >({
    cancellationType: ActivityCancellationType.ABANDON,

    startToCloseTimeout: "300 second",

    retry: { maximumAttempts },
    activityId,
  });

  return action;
};

export const runFlowWorkflow = async (
  params: BaseRunFlowWorkflowParams,
): Promise<RunFlowWorkflowResponse> => {
  return await processFlowWorkflow({
    ...params,
    flowType: "integration",
    proxyFlowActivity,
  });
};
