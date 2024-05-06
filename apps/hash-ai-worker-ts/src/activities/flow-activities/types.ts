import type {
  StepInput,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

export type FlowActionActivity<AdditionalParams extends object = object> = (
  params: {
    inputs: StepInput[];
  } & AdditionalParams,
) => Promise<
  Status<{
    outputs: StepOutput[];
  }>
>;
