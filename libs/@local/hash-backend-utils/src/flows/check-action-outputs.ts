import { asPayload } from "@local/hash-isomorphic-utils/flows/types";
import { validateActionOutputs } from "@local/hash-isomorphic-utils/flows/validate-payloads";
import { StatusCode } from "@local/status";

import type { ActionName, FlowActionActivity } from "./action-types.js";
import type { FlowActionStepOutput } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FlowActionDefinitionId,
  StepInput,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

const actionNameSuffix = "Action";

/**
 * Wraps each action activity so that outputs it returns which don't fit its definition (see `validateActionOutputs`)
 * fail its step with what's wrong, like an action that returns an error status. The check runs in the activity, not
 * the workflow, so that a run's history, from which its step statuses are read, records the step as failed.
 */
export const checkActionOutputs = <
  ActionDefinitionId extends FlowActionDefinitionId,
>(
  activities: Record<ActionName<ActionDefinitionId>, FlowActionActivity>,
): Record<ActionName<ActionDefinitionId>, FlowActionActivity> =>
  Object.fromEntries(
    Object.entries<FlowActionActivity>(activities).map(([name, activity]) => {
      const actionDefinitionId = name.slice(
        0,
        -actionNameSuffix.length,
      ) as ActionDefinitionId;

      const checkedActivity = (async (params: { inputs: StepInput[] }) => {
        const response: Status<{
          outputs: FlowActionStepOutput<FlowActionDefinitionId>[];
        }> = await activity(params);

        if (response.code !== StatusCode.Ok) {
          return response;
        }

        const outputs: StepOutput[] = (response.contents[0]?.outputs ?? []).map(
          ({ outputName, payload }) => ({
            outputName,
            payload: asPayload(payload),
          }),
        );

        const invalidOutputMessage = validateActionOutputs({
          actionDefinitionId,
          inputs: params.inputs,
          outputs,
        });

        return invalidOutputMessage
          ? {
              code: StatusCode.Internal,
              message: invalidOutputMessage,
              contents: [],
            }
          : response;
      }) as FlowActionActivity;

      return [name, checkedActivity];
    }),
  ) as Record<ActionName<ActionDefinitionId>, FlowActionActivity>;
