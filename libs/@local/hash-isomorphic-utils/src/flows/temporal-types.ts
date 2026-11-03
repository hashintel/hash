import type { FlowRunEventError, FlowRunStepError } from "./run-events.js";
import type {
  FlowDataSources,
  LocalFlowRun,
  FlowInputValues,
  StepOutput,
} from "./types.js";
import type {
  EntityId,
  EntityUuid,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
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
  flowRunEntityUuid?: EntityUuid;
  /**
   * The `Flow Definition` entity to run. The run loads the definition when it starts, so it runs the edition current
   * at that time.
   */
  flowDefinitionEntityId: EntityId;
  /**
   * Optional name for the flow run. If not provided, the flow definition name is used.
   * For scheduled flows, this is typically the schedule name.
   */
  flowRunName?: string;
  flowInputs: FlowInputValues;
  /** The `Flow Trigger` entity that started the run, if any (e.g. a `Flow Schedule`). */
  flowTriggerEntityId?: EntityId;
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

/**
 * How a run ended: as the event that closes its workflow's history records it, or as the workflow gives it to the
 * activity that records the run before that event is written.
 */
export type FlowRunEnding =
  | {
      kind: "completed";
      flowOutputs: StepOutput[];
      stepErrors?: FlowRunStepError[];
    }
  | {
      kind: "failed";
      failure: FlowRunEventError;
      stepErrors?: FlowRunStepError[];
    }
  | { kind: "cancelled" }
  | { kind: "terminated"; reason?: string }
  | { kind: "timedOut" };
