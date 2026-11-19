import type { EntityId, MachineId } from "@blockprotocol/type-system";
import type {
  BaseRunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";

export type SyncQueryToGoogleSheetWorkflow = (params: {
  integrationEntityId: EntityId;
  userAccountId: MachineId;
}) => Promise<void>;

export type RunIntegrationFlowWorkflow = (
  params: BaseRunFlowWorkflowParams,
) => Promise<RunFlowWorkflowResponse>;

export type WorkflowTypeMap = {
  runFlow: RunIntegrationFlowWorkflow;
};
