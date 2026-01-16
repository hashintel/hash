import type {
  AiActionStepOutput,
  AiFlowActionDefinitionId,
  IntegrationActionStepOutput,
  IntegrationFlowActionDefinitionId,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
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

/**
 * A type-safe version of FlowActionActivity that properly types the outputs
 * based on the action definition.
 */
export type AiFlowActionActivity<
  T extends AiFlowActionDefinitionId,
  AdditionalParams extends object = object,
> = (
  params: {
    inputs: StepInput[];
  } & AdditionalParams,
) => Promise<
  Status<{
    outputs: AiActionStepOutput<T>[];
  }>
>;

/**
 * A type-safe version of FlowActionActivity for integration actions that
 * properly types the outputs based on the action definition.
 */
export type IntegrationFlowActionActivity<
  T extends IntegrationFlowActionDefinitionId,
  AdditionalParams extends object = object,
> = (
  params: {
    inputs: StepInput[];
  } & AdditionalParams,
) => Promise<
  Status<{
    outputs: IntegrationActionStepOutput<T>[];
  }>
>;

export type ActionName<ActionDefinitionId extends string> =
  `${ActionDefinitionId}Action`;

export type CreateFlowActivities<ActionDefinitionId extends string> = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any,
) => Record<ActionName<ActionDefinitionId>, FlowActionActivity>;

export type ProxyFlowActivity<
  ActionId extends string,
  CreateActivitiesFn extends CreateFlowActivities<ActionId>,
> = (params: {
  actionName: ActionName<ActionId>;
  maximumAttempts: number;
  activityId: string;
}) => ReturnType<CreateActivitiesFn>[ActionName<ActionId>];
