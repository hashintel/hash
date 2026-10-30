import { aiActionDefinitions } from "./action-definitions.js";
import { getAllStepDefinitionsInFlowDefinition } from "./util.js";

import type { FlowDefinition } from "./types.js";

/**
 * Which worker runs a flow's workflow, and so which Temporal task queue its runs are started on: the AI worker if any
 * of its actions is an AI action, otherwise the integration worker. Each action runs on its own task queue,
 * whichever worker runs the workflow (see `getActionActivityOptions`).
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
