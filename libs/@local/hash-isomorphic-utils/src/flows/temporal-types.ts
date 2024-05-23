import type { AccountId, OwnedById } from "@local/hash-subgraph";
import type { Status } from "@local/status";

import type { FlowDefinition, FlowTrigger,LocalFlowRun } from "./types";

export type RunFlowWorkflowParams = {
  flowTrigger: FlowTrigger;
  flowDefinition: FlowDefinition;
  userAuthentication: { actorId: AccountId };
  webId: OwnedById;
};

export type RunFlowWorkflowResponse = Status<{
  flow?: LocalFlowRun;
  outputs?: LocalFlowRun["outputs"];
  stepErrors?: Status<{ stepId: string }>[];
}>;
