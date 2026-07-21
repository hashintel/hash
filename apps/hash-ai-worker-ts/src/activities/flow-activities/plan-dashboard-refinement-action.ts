import dedent from "dedent";

import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";

import type { PermittedAnthropicModel } from "../shared/get-llm-response/anthropic-client.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";

export type DashboardRefinementScope = "query" | "analysis" | "chart" | "none";

const model: PermittedAnthropicModel = "claude-opus-4-8";

const tools: LlmToolDefinition<"submit_refinement_plan">[] = [
  {
    name: "submit_refinement_plan",
    description:
      "Select the earliest configuration stage that must change to satisfy the refinement.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["query", "analysis", "chart", "none"],
          description:
            "query changes data selection; analysis changes transformation/aggregation; chart changes only presentation; none means no configuration change is needed",
        },
      },
      required: ["scope"],
      additionalProperties: false,
    },
  },
];

type ActionOutputs = AiActionStepOutput<"planDashboardRefinement">[];

export const planDashboardRefinementAction: AiFlowActionActivity<
  "planDashboardRefinement"
> = async ({ inputs }) => {
  const {
    userGoal,
    refinementInstruction,
    existingStructuralQuery,
    existingPythonScript,
    existingChartType,
    existingChartConfig,
  } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "planDashboardRefinement",
  }) as {
    [Key in InputNameForAiFlowAction<"planDashboardRefinement">]: string;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  try {
    const response = await getLlmResponse(
      {
        model,
        tools,
        toolChoice: "submit_refinement_plan",
        systemPrompt: dedent(`
          You plan refinements to a dashboard chart pipeline with three ordered stages:
          query selects graph data, analysis transforms it with Python, and chart controls presentation.
          Select the earliest stage that must change. Downstream stages will be regenerated automatically.
          Use "chart" for colors, labels, legends, axes, and chart styling.
          Use "analysis" for grouping, aggregation, calculations, sorting, or output columns.
          Use "query" for entity types, filters, time/entity selection, or related-entity traversal.
          Use "none" only when the instruction is already fully satisfied.
        `),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: dedent(`
                  Original goal: ${userGoal}
                  Refinement instruction: ${refinementInstruction}

                  Existing structural query:
                  ${existingStructuralQuery}

                  Existing Python:
                  ${existingPythonScript}

                  Existing chart type: ${existingChartType}
                  Existing chart config:
                  ${existingChartConfig}
                `),
              },
            ],
          },
        ],
      },
      {
        customMetadata: {
          stepId,
          taskName: "plan-dashboard-refinement",
        },
        userAccountId: userAuthentication.actorId,
        graphApiClient,
        incurredInEntities: [{ entityId: flowEntityId }],
        webId,
      },
    );

    if (response.status !== "ok") {
      throw new Error(`LLM error: ${response.status}`);
    }

    const toolCall = getToolCallsFromLlmAssistantMessage({
      message: response.message,
    })[0];
    if (!toolCall) {
      throw new Error("Refinement planner did not submit a plan");
    }

    const { scope } = toolCall.input as { scope: DashboardRefinementScope };
    const outputs: ActionOutputs = [
      {
        outputName: "refinementScope",
        payload: { kind: "Text", value: scope },
      },
    ];

    return {
      code: StatusCode.Ok,
      message: "Dashboard refinement planned",
      contents: [{ outputs }],
    };
  } catch (error) {
    return {
      code: StatusCode.Internal,
      message: error instanceof Error ? error.message : "Unknown error",
      contents: [],
    };
  }
};
