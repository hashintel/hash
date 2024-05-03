import type { AccountId, OwnedById } from "@local/hash-subgraph";
import type { Status } from "@local/status";

import type { Flow, FlowDefinition, FlowTrigger } from "./types";

export type RunFlowWorkflowParams = {
  flowTrigger: FlowTrigger;
  flowDefinition: FlowDefinition;
  userAuthentication: { actorId: AccountId };
  webId: OwnedById;
};

export type RunFlowWorkflowResponse = Status<{
  flow?: Flow;
  outputs?: Flow["outputs"];
  stepErrors?: Status<{ stepId: string }>[];
}>;
