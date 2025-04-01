import type { ActorEntityUuid, OwnedById } from "@blockprotocol/type-system";
import type { Status } from "@local/status";

import type {
  FlowDataSources,
  FlowDefinition,
  FlowTrigger,
  LocalFlowRun,
} from "./types.js";

export type RunFlowWorkflowParams = {
  dataSources: FlowDataSources;
  flowTrigger: FlowTrigger;
  flowDefinition: FlowDefinition;
  userAuthentication: { actorId: ActorEntityUuid };
  webId: OwnedById;
};

export type RunFlowWorkflowResponse = Status<{
  flow?: LocalFlowRun;
  outputs?: LocalFlowRun["outputs"];
  stepErrors?: Status<{ stepId: string }>[];
}>;
