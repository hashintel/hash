import type {
  FlowDataSources,
  FlowDefinition,
  LocalFlowRun,
  FlowInputValues,
} from "./types.js";
import type { EntityUuid, UserId, WebId } from "@blockprotocol/type-system";
import type { Status } from "@local/status";

export type BaseRunFlowWorkflowParams = {
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
  /** The definition to run, which the caller has validated. */
  flowDefinition: FlowDefinition;
  flowDefinitionId: EntityUuid;
  /**
   * Optional name for the flow run. If not provided, the flow definition name is used.
   * For scheduled flows, this is typically the schedule name.
   */
  flowRunName?: string;
  flowInputs: FlowInputValues;
  userAuthentication: { actorId: UserId };
  webId: WebId;
};

export type RunAiFlowWorkflowParams = BaseRunFlowWorkflowParams & {
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
