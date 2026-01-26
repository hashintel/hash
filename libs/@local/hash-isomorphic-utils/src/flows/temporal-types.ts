import type { EntityUuid, UserId, WebId } from "@blockprotocol/type-system";
import type { Status } from "@local/status";

import type { AiFlowActionDefinitionId } from "./action-definitions.js";
import type {
  FlowActionDefinitionId,
  FlowDataSources,
  FlowDefinition,
  FlowTrigger,
  LocalFlowRun,
} from "./types.js";

export type BaseRunFlowWorkflowParams<
  ValidActionDefinitionId extends
    FlowActionDefinitionId = FlowActionDefinitionId,
> = {
  /**
   * Optionally provide the UUID to use when persisting the Flow Entity.
   * For manually-triggered Flow Runs, so that the user can be instantly given the entity's UUID,
   * and re-routed to the page (in the frontend).
   *
   * Not used for schedules:
   * 1. The first run might not start immediately, so we don't do any re-routing.
   * 2. Schedules result in multiple runs, so there's no single entity UUID to return.
   */
  flowRunId?: EntityUuid;
  flowDefinition: FlowDefinition<ValidActionDefinitionId>;
  /**
   * Optional name for the flow run. If not provided, the flow definition name is used.
   * For scheduled flows, this is typically the schedule name.
   */
  flowRunName?: string;
  flowTrigger: FlowTrigger;
  userAuthentication: { actorId: UserId };
  webId: WebId;
};

export type RunAiFlowWorkflowParams =
  BaseRunFlowWorkflowParams<AiFlowActionDefinitionId> & {
    dataSources: FlowDataSources;
  };

export type RunFlowWorkflowParams =
  | BaseRunFlowWorkflowParams
  | RunAiFlowWorkflowParams;

export type RunFlowWorkflowResponse = Status<{
  flow?: LocalFlowRun;
  outputs?: LocalFlowRun["outputs"];
  stepErrors?: Status<{ stepId: string }>[];
}>;
