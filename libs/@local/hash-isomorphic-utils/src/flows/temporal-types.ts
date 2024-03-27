import type { AccountId } from "@local/hash-subgraph";
import type { Status } from "@local/status";

import type { Flow, FlowDefinition, FlowTrigger } from "./types";

export type RunFlowWorkflowParams = {
  trigger: FlowTrigger;
  flowDefinition: FlowDefinition;
  userAuthentication: { actorId: AccountId };
};

export type RunFlowWorkflowResponse = Status<{
  flowOutputs?: Flow["outputs"];
  stepErrors?: Status<{ stepId: string }>[];
}>;
