import { proxyActivities } from "@temporalio/workflow";

import { type ProxyFlowActivity } from "@local/hash-backend-utils/flows";
import { getActionActivityOptions } from "@local/hash-backend-utils/flows/action-activity-options";
import { processFlowWorkflow } from "@local/hash-backend-utils/flows/process-flow-workflow";

import type { createFlowActivities } from "../activities/flow-activities.js";
import type { IntegrationFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  BaseRunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";

const proxyFlowActivity: ProxyFlowActivity<
  IntegrationFlowActionDefinitionId,
  typeof createFlowActivities
> = (params) => {
  const { actionDefinitionId, actionName, maximumAttempts, activityId } =
    params;

  const { [actionName]: action } = proxyActivities<
    ReturnType<typeof createFlowActivities>
  >({
    ...getActionActivityOptions(actionDefinitionId),
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
    proxyFlowActivity,
  });
};
