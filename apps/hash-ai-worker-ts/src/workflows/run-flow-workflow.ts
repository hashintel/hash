import { proxyActivities } from "@temporalio/workflow";

import { getActionActivityOptions } from "@local/hash-backend-utils/flows/action-activity-options";
import { processFlowWorkflow } from "@local/hash-backend-utils/flows/process-flow-workflow";
import { type AiFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { setQueryAndSignalHandlers } from "./run-flow-workflow/set-query-and-signal-handlers.js";

import type { createFlowActivities } from "../activities/flow-activities.js";
import type { EntityId } from "@blockprotocol/type-system";
import type { ProxyFlowActivity } from "@local/hash-backend-utils/flows";
import type {
  RunAiFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowDefinition,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";

const proxyFlowActivity: ProxyFlowActivity<
  AiFlowActionDefinitionId,
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

const generateFlowRunName = (params: {
  flowDefinition: FlowDefinition;
  flowDefinitionEntityId: EntityId;
  flowInputs: FlowInputValues;
}) => {
  const { generateFlowRunName: generateFlowRunNameActivity } = proxyActivities<
    ReturnType<typeof createFlowActivities>
  >({
    startToCloseTimeout: "60 second",
    retry: { maximumAttempts: 1 },
  });

  return generateFlowRunNameActivity(params);
};

export const runFlowWorkflow = async (
  params: RunAiFlowWorkflowParams,
): Promise<RunFlowWorkflowResponse> => {
  setQueryAndSignalHandlers();

  return await processFlowWorkflow({
    ...params,
    proxyFlowActivity,
    generateFlowRunName,
  });
};
