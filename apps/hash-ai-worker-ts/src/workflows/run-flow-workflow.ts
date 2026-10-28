import { proxyActivities } from "@temporalio/workflow";

import { processFlowWorkflow } from "@local/hash-backend-utils/flows/process-flow-workflow";

import { setQueryAndSignalHandlers } from "./run-flow-workflow/set-query-and-signal-handlers.js";

import type { createFlowActivities } from "../activities/flow-activities.js";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  RunAiFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowDefinition,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";

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
  setQueryAndSignalHandlers({ userAuthentication: params.userAuthentication });

  return await processFlowWorkflow({
    ...params,
    generateFlowRunName,
  });
};
