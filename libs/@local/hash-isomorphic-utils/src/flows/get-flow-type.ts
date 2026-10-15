import { aiActionDefinitions } from "./action-definitions.js";
import { getAllStepDefinitionsInFlowDefinition } from "./util.js";

import type { FlowDefinition } from "./types.js";

/**
 * Which worker runs a flow, and so which Temporal task queue its runs are started on: the AI worker if any of its
 * actions is an AI action, otherwise the integration worker.
 *
 * `validateFlowDefinition` rejects flows that mix AI and integration actions, because a run happens on one worker.
 */
export const getFlowType = (
  flowDefinition: FlowDefinition<string>,
): "ai" | "integration" =>
  getAllStepDefinitionsInFlowDefinition(flowDefinition).some(
    (step) =>
      step.kind === "action" &&
      Object.hasOwn(aiActionDefinitions, step.actionDefinitionId),
  )
    ? "ai"
    : "integration";
