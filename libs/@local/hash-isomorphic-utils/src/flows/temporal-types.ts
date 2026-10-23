import type {
  FlowDataSources,
  LocalFlowRun,
  FlowInputValues,
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

/** How a run ended, as the event that closes its workflow's history records it. */
export type FlowRunEnding =
  | { kind: "completed"; result: RunFlowWorkflowResponse }
  | {
      kind: "failed";
      failureMessage: string;
      stepErrors?: Status<{ stepId: string }>[];
    }
  | { kind: "cancelled" }
  | { kind: "terminated"; reason?: string }
  | { kind: "timedOut" };

/**
 * How a run is ending, as its workflow gives it to the activity that records the run, which runs before the event that
 * closes the run is written. A completed run's outputs are read from its history instead, so the workflow doesn't pass
 * them to the activity as well as returning them.
 */
export type RecordedFlowRunEnding =
  | {
      kind: "completed";
      code: RunFlowWorkflowResponse["code"];
      stepErrors?: Status<{ stepId: string }>[];
    }
  | Exclude<FlowRunEnding, { kind: "completed" }>;
