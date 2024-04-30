import type {
  StepInput,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { AccountId, EntityId } from "@local/hash-subgraph";
import type { Status } from "@local/status";

export type FlowActionActivity<AdditionalParams extends object = object> = (
  params: {
    inputs: StepInput[];
    userAuthentication: {
      actorId: AccountId;
    };
    flowEntityId: EntityId;
  } & AdditionalParams,
) => Promise<
  Status<{
    outputs: StepOutput[];
  }>
>;
