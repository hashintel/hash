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
