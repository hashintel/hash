import type {
  FlowActionInputKinds,
  FlowActionInputs,
  FlowActionStepOutput,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { FlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

/**
 * An activity that runs a flow action. Its outputs are typed by the action's definition: by default, the outputs of
 * any action.
 *
 * It is generic over the kind each of the action's kind sources is given (see `InputKindsOf`), which `inputs` carries
 * to `getSimplifiedFlowActionInputs`. So an output that takes its kind from a kind source must have the kind given,
 * built from that input's own kind and values, and TypeScript rejects one of any other kind.
 */
export type FlowActionActivity<
  Action extends FlowActionDefinitionId = FlowActionDefinitionId,
  AdditionalParams extends object = object,
> = <Kinds extends FlowActionInputKinds<Action>>(
  params: {
    inputs: FlowActionInputs<Kinds>;
  } & AdditionalParams,
) => Promise<
  Status<{
    outputs: FlowActionStepOutput<Action, Kinds>[];
  }>
>;

export type ActionName<ActionDefinitionId extends string> =
  `${ActionDefinitionId}Action`;

export type CreateFlowActivities<ActionDefinitionId extends string> = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any,
) => Record<ActionName<ActionDefinitionId>, FlowActionActivity>;
