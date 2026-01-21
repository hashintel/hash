import type { UserId, WebId } from "@blockprotocol/type-system";
import type { Status } from "@local/status";

import type { AiFlowActionDefinitionId } from "./action-definitions.js";
import type {
  FlowActionDefinitionId,
  FlowDataSources,
  FlowDefinition,
  FlowTrigger,
  LocalFlowRun,
} from "./types.js";

export type BaseRunFlowWorkflowParams<
  ValidActionDefinitionId extends
    FlowActionDefinitionId = FlowActionDefinitionId,
> = {
  flowDefinition: FlowDefinition<ValidActionDefinitionId>;
  /**
   * Optional name for the flow run. If not provided, the flow definition name is used.
   * For scheduled flows, this is typically the schedule name.
   */
  flowRunName?: string;
  flowTrigger: FlowTrigger;
  userAuthentication: { actorId: UserId };
  webId: WebId;
};

export type RunAiFlowWorkflowParams =
  BaseRunFlowWorkflowParams<AiFlowActionDefinitionId> & {
    dataSources: FlowDataSources;
  };

export type RunFlowWorkflowParams =
  | BaseRunFlowWorkflowParams
  | RunAiFlowWorkflowParams;

export type RunFlowWorkflowResponse = Status<{
  flow?: LocalFlowRun;
  outputs?: LocalFlowRun["outputs"];
  stepErrors?: Status<{ stepId: string }>[];
}>;
