import type { UserId, WebId } from "@blockprotocol/type-system";
import type { Status } from "@local/status";

import type {
  FlowDataSources,
  FlowDefinition,
  FlowTrigger,
  LocalFlowRun,
} from "./types.js";

export type BaseRunFlowWorkflowParams = {
  flowDefinition: FlowDefinition;
  flowTrigger: FlowTrigger;
  userAuthentication: { actorId: UserId };
  webId: WebId;
};

export type RunAiFlowWorkflowParams = BaseRunFlowWorkflowParams & {
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
