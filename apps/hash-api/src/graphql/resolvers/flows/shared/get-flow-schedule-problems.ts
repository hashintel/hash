import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { getFlowType } from "@local/hash-isomorphic-utils/flows/get-flow-type";
import { mapInputsPropertyToFlowInputValues } from "@local/hash-isomorphic-utils/flows/mappings";
import {
  omitInvalidEmptyFlowInputs,
  validateFlowInputs,
} from "@local/hash-isomorphic-utils/flows/validate-payloads";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import * as GraphQLError from "../../../error";

import type { LoggedInGraphQLContext } from "../../../context";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

/**
 * How a schedule's Temporal schedule starts runs: the task queue it starts them on, which is the type of flow it was
 * set up to run, and the arguments it starts them with.
 *
 * @throws a GraphQL internal error if the Temporal schedule can't be loaded.
 */
export const getScheduledFlowRun = async (
  { temporal }: Pick<LoggedInGraphQLContext, "temporal">,
  schedule: HashEntity<FlowSchedule>,
) => {
  const scheduleEntityId = schedule.metadata.recordId.entityId;

  try {
    const { action } = await temporal.schedule
      .getHandle(extractEntityUuidFromEntityId(scheduleEntityId))
      .describe();

    return {
      taskQueue: action.taskQueue,
      params: action.args?.[0] as RunFlowWorkflowParams,
    };
  } catch (err) {
    throw GraphQLError.internal(
      `Failed to load Temporal schedule for schedule entity ${scheduleEntityId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

/**
 * Why a schedule couldn't start runs of a valid definition, each with what the user can do about it: the values it
 * gives the flow's inputs would fail the check a run makes when it starts, or the definition is another type of flow
 * than the one the schedule was set up to run, whose runs go to another task queue and need other arguments (e.g. data
 * sources for an AI flow). Empty if it could.
 *
 * Neither can be fixed by pausing the schedule, as resuming it makes the same check, and neither its inputs nor its
 * task queue can be changed once it's created.
 */
export const getFlowScheduleProblems = ({
  flowDefinition,
  schedule,
  scheduledFlowType,
}: {
  flowDefinition: FlowDefinition<string>;
  schedule: HashEntity<FlowSchedule>;
  scheduledFlowType: string;
}): string[] => {
  const { inputs } = simplifyProperties(schedule.properties);

  const inputsProblem = validateFlowInputs({
    inputDefinitions: flowDefinition.inputs,
    flowInputs: omitInvalidEmptyFlowInputs({
      inputDefinitions: flowDefinition.inputs,
      flowInputs: inputs ? mapInputsPropertyToFlowInputValues(inputs) : {},
    }),
  });

  const problems = inputsProblem
    ? [
        "the values it gives the flow's inputs don't fit them any more, and a schedule's values can't be changed. Change the inputs back, or delete the schedule and add it again.",
      ]
    : [];

  /* In practice an integration schedule of a flow that now has an AI step: every step the editor adds is one. */
  if (getFlowType(flowDefinition) !== scheduledFlowType) {
    problems.push(
      scheduledFlowType === "ai"
        ? "it was added when the flow had steps that use AI, so it can only run a flow that does. Delete it and add it again."
        : "it was added when the flow had no steps that use AI, so it can't run a flow that does. Delete it and add it again.",
    );
  }

  return problems;
};
