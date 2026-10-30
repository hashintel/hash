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

const describeFlowType = (flowType: string) =>
  flowType === "ai" ? "an AI flow" : `an ${flowType} flow`;

/**
 * Why a schedule couldn't start runs of a valid definition: the values it gives the flow's inputs would fail the check
 * a run makes when it starts, or the definition is another type of flow than the one the schedule was set up to run,
 * whose runs go to another task queue and need other arguments (e.g. data sources for an AI flow). Empty if it could.
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

  const problems = inputsProblem ? [inputsProblem] : [];

  const flowType = getFlowType(flowDefinition);

  if (flowType !== scheduledFlowType) {
    problems.push(
      `it was set up to run ${describeFlowType(scheduledFlowType)}, not ${describeFlowType(flowType)}`,
    );
  }

  return problems;
};
