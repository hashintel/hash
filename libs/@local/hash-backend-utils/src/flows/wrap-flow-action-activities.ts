import { checkActionOutputs } from "./check-action-outputs.js";
import { signalStepAttempts } from "./signal-step-attempts.js";

import type { ActionName, FlowActionActivity } from "./action-types.js";
import type { FlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/types";

/**
 * Wraps each of a worker's flow action activities in what every flow action needs: checking the outputs it returns
 * (see `checkActionOutputs`), and signalling its run about its attempts (see `signalStepAttempts`).
 */
export const wrapFlowActionActivities = <
  ActionDefinitionId extends FlowActionDefinitionId,
>(
  activities: Record<ActionName<ActionDefinitionId>, FlowActionActivity>,
): Record<ActionName<ActionDefinitionId>, FlowActionActivity> =>
  signalStepAttempts(checkActionOutputs<ActionDefinitionId>(activities));
