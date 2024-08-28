import dedent from "dedent";

import { logger } from "../../../shared/activity-logger.js";
import type { ParsedLlmToolCall } from "../../../shared/get-llm-response/types.js";
import { stringify } from "../../../shared/stringify.js";
import type { ParsedCoordinatorToolCallMap } from "../shared/coordinator-tools.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "../shared/coordinators.js";

/**
 * Processes a 'complete' call from the coordinating agent.
 *
 * The purpose of this is to check if there is any reason to ask the agent to reconsider its decision to complete, e.g.:
 * 1. If no entities have been proposed.
 * 2. If the agent has marked entityIds as relevant, but those entityIds do not exist
 * 2. If the agent has not proposed any entities of a certain type.
 * 3. If the agent has not proposed any links of a certain type.
 */
export const processCompleteToolCall = ({
  toolCall,
  input,
  state,
}: {
  input: CoordinatingAgentInput;
  toolCall: ParsedCoordinatorToolCallMap["complete"];
  state: CoordinatingAgentState;
}): {
  output: string;
  isError?: true;
} & ParsedLlmToolCall<"complete"> => {
  if (state.hasConductedCompleteCheckStep) {
    /**
     * The check step was already conducted and the agent has decided to complete the task anyway.
     */
    return {
      ...toolCall,
      output: `The research task has been completed.`,
    };
  }

  const warnings: string[] = [];

  if (state.proposedEntities.length === 0) {
    warnings.push("No entities have been proposed.");
  }

  const { entityIds } = toolCall.input;

  const invalidEntityIds = entityIds.filter(
    (entityId) =>
      !state.proposedEntities.some(
        ({ localEntityId }) => localEntityId === entityId,
      ),
  );

  if (invalidEntityIds.length > 0) {
    return {
      ...toolCall,
      output: dedent(`
        The following entity IDs do not correspond to any proposed entities: ${JSON.stringify(
          invalidEntityIds,
        )}

        ${
          state.proposedEntities.length > 0
            ? `Valid entity IDs are: ${JSON.stringify(
                state.proposedEntities.map(
                  ({ localEntityId }) => localEntityId,
                ),
              )}`
            : `You haven't discovered any entities yet.`
        }
      `),
      isError: true,
    };
  }

  // eslint-disable-next-line no-param-reassign
  state.submittedEntityIds = entityIds;

  const submittedEntities = state.proposedEntities.filter(({ localEntityId }) =>
    entityIds.includes(localEntityId),
  );

  const missingEntityTypes = input.entityTypes.filter(
    ({ $id }) =>
      !submittedEntities.some(({ entityTypeId }) => entityTypeId === $id),
  );

  if (missingEntityTypes.length > 0) {
    warnings.push(
      `You have not proposed any entities for the following types: ${JSON.stringify(
        missingEntityTypes.map(({ $id }) => $id),
      )}`,
    );
  }

  const missingLinkEntityTypes = input.linkEntityTypes?.filter(
    ({ $id }) =>
      !submittedEntities.some(({ entityTypeId }) => entityTypeId === $id),
  );

  if (missingLinkEntityTypes && missingLinkEntityTypes.length > 0) {
    warnings.push(
      dedent(`
        You have not proposed any links for the following link types: ${JSON.stringify(
          missingLinkEntityTypes.map(({ $id }) => $id),
        )}
      `),
    );
  }

  if (warnings.length > 0) {
    logger.debug(`Conducting check step with warnings: ${stringify(warnings)}`);
    return {
      ...toolCall,
      output: dedent(`
        Are you sure the research task is complete considering the following warnings?

        Warnings:
        ${warnings.join("\n")}

        If you are sure the task is complete, call the "complete" tool again.
        Otherwise, either continue to make tool calls or call the "terminate" tool to end the task if it cannot be completed.
      `),
      isError: true,
    };
  }

  return {
    ...toolCall,
    output: `The research task has been completed.`,
  };
};
