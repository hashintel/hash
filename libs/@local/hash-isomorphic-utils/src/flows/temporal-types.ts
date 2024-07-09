import type { AccountId } from "@local/hash-graph-types/account";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { Status } from "@local/status";

import type {
  FlowDataSources,
  FlowDefinition,
  FlowTrigger,
  LocalFlowRun,
} from "./types";

export type RunFlowWorkflowParams = {
  dataSources: FlowDataSources;
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
