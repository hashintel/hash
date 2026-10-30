import { processFlowWorkflow } from "@local/hash-backend-utils/flows/process-flow-workflow";

import type {
  BaseRunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";

export const runFlowWorkflow = async (
  params: BaseRunFlowWorkflowParams,
): Promise<RunFlowWorkflowResponse> => {
  return await processFlowWorkflow(params);
};
