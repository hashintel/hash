import dedent from "dedent";

import { chartConfigSchema } from "@local/hash-isomorphic-utils/chart-config-schema";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { stringify } from "../shared/stringify.js";
import { getChartConfigProblems } from "./chart-config-validation.js";

import type { PermittedAnthropicModel } from "../shared/get-llm-response/anthropic-client.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
/**
 * Flow activity for generating chart configuration.
 * This activity generates Apache ECharts configuration based on chart data and user goal.
 */
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { ChartConfig } from "@local/hash-isomorphic-utils/dashboard-types";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";

const model: PermittedAnthropicModel = "claude-opus-4-8";

const systemPrompt = dedent(`
  You are an expert at data visualization. Your job is to generate a chart configuration for an
  Apache ECharts-based renderer, given the chart data and the user's goal.

  The configuration is NOT a raw ECharts option object — it is a simplified ChartConfig that the
  renderer translates into ECharts options:
  - "categoryKey": the data key used for the category axis (x-axis for bar/line, slice name for
    pie, point label for scatter/map). It MUST be one of the keys present in the data rows.
  - "series": one entry per data series. Each entry's "dataKey" MUST be a numeric key present in
    the data rows. "type" is the chart type for that series.
  - Multiple series (e.g. several numeric keys on a bar chart) render as grouped series; set
    "name" on each so the legend is meaningful, and set "showLegend": true.
  - For stacked bar/line charts, give the series a shared "stack" value.
  - For line charts of time series, "smooth": true usually reads better.
  - For pie charts, use a single series with "radius" (e.g. "60%" or ["40%", "70%"] for a donut)
    and enable the legend when there are several slices.
  - Always set "showTooltip": true; set "showGrid": true for bar/line/scatter.
  - Provide "xAxisLabel" / "yAxisLabel" for bar, line and scatter charts, with units where known
    (e.g. "Revenue (USD)").
  - Only provide "colors" if the user's goal implies specific colors; otherwise omit it and let
    the app palette apply.

  Choose keys strictly from the data keys you are shown — never invent keys.

  The requested chart type is an input — respect it. But if you are ever in a position to choose,
  strongly prefer bar and line charts over pie charts: pies are hard to compare and only
  acceptable when the user explicitly asked for one.
`);

type ToolName = "submit_config";

/**
 * Build the tool schema for chart configuration.
 * Uses the auto-generated schema from ChartConfig type.
 */
const buildToolSchema = (): LlmToolDefinition<ToolName>["inputSchema"] => {
  /**
   * The generated schema's internal $refs point at `#/definitions/...`, so
   * the definitions must be mounted under `definitions` (not `$defs`) for
   * those references to resolve during input validation.
   */
  return {
    type: "object",
    properties: {
      config: {
        $ref: "#/definitions/ChartConfig",
        description: "The chart configuration object",
      },
      explanation: {
        type: "string",
        description: "Explanation of why this configuration was chosen",
      },
    },
    required: ["config", "explanation"],
    additionalProperties: false,
    definitions: chartConfigSchema.definitions,
  } as LlmToolDefinition<ToolName>["inputSchema"];
};

const tools: LlmToolDefinition<ToolName>[] = [
  {
    name: "submit_config",
    description: "Submit the ECharts configuration",
    /**
     * The model sometimes provides the `config` argument as a JSON-encoded
     * string rather than an object — parse it before schema validation.
     */
    sanitizeInputBeforeValidation: (rawInput) => {
      if (
        "config" in rawInput &&
        typeof (rawInput as { config: unknown }).config === "string"
      ) {
        return {
          ...rawInput,
          config: JSON.parse(
            (rawInput as { config: string }).config,
          ) as unknown,
        };
      }
      return rawInput;
    },
    inputSchema: buildToolSchema(),
  },
];

const maximumIterations = 4;

type ActionOutputs = AiActionStepOutput<"generateChartConfig">[];

export const generateChartConfigAction: AiFlowActionActivity<
  "generateChartConfig"
> = async ({ inputs }) => {
  const {
    chartData,
    chartType,
    userGoal,
    refinementInstruction,
    existingChartConfig,
    refinementScope,
  } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "generateChartConfig",
  }) as {
    [K in InputNameForAiFlowAction<"generateChartConfig">]: string | undefined;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  if (refinementScope === "none") {
    if (!existingChartConfig) {
      return {
        code: StatusCode.InvalidArgument,
        message: "Existing chart config is required for refinement",
        contents: [],
      };
    }
    const outputs: ActionOutputs = [
      {
        outputName: "chartConfig",
        payload: { kind: "Text", value: existingChartConfig },
      },
      {
        outputName: "explanation",
        payload: {
          kind: "Text",
          value: "Existing chart configuration preserved",
        },
      },
    ];
    return {
      code: StatusCode.Ok,
      message: "Existing chart configuration preserved",
      contents: [{ outputs }],
    };
  }

  if (!chartData || !chartType || !userGoal) {
    return {
      code: StatusCode.InvalidArgument,
      message: "chartData, chartType, and userGoal are required",
      contents: [],
    };
  }

  // Parse chartData from JSON string
  let parsedChartData: unknown[];
  try {
    parsedChartData = JSON.parse(chartData) as unknown[];
  } catch {
    return {
      code: StatusCode.InvalidArgument,
      message: "Invalid chartData JSON",
      contents: [],
    };
  }

  let chartConfig: ChartConfig | null = null;
  let explanation = "";

  const dataKeys =
    parsedChartData.length > 0 &&
    typeof parsedChartData[0] === "object" &&
    parsedChartData[0] !== null
      ? Object.keys(parsedChartData[0])
      : [];

  type MessageType = Parameters<typeof getLlmResponse>[0]["messages"];

  const callModel = async (
    messages: MessageType,
    iteration: number,
  ): Promise<void> => {
    if (iteration > maximumIterations) {
      throw new Error(
        `Exceeded maximum iterations (${maximumIterations}) for chart config generation`,
      );
    }

    const llmResponse = await getLlmResponse(
      {
        model,
        systemPrompt,
        messages,
        tools,
      },
      {
        customMetadata: {
          stepId,
          taskName: "generate-chart-config",
        },
        userAccountId: userAuthentication.actorId,
        graphApiClient,
        incurredInEntities: [{ entityId: flowEntityId }],
        webId,
      },
    );

    if (llmResponse.status !== "ok") {
      throw new Error(`LLM error: ${llmResponse.status}`);
    }

    const { message } = llmResponse;
    const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

    const submitCall = toolCalls[0];

    if (submitCall) {
      const args = submitCall.input as {
        config: ChartConfig;
        explanation: string;
      };

      const problems = getChartConfigProblems(args.config, dataKeys);

      if (problems.length > 0) {
        /**
         * Every tool_use block in the assistant message needs a matching
         * tool_result, otherwise the Anthropic API rejects the conversation
         * — so also answer any extra (ignored) tool calls.
         */
        return callModel(
          [
            ...messages,
            message,
            {
              role: "user",
              content: toolCalls.map((toolCall) => ({
                type: "tool_result" as const,
                tool_use_id: toolCall.id,
                content:
                  toolCall.id === submitCall.id
                    ? dedent(`
                        The submitted configuration is invalid:
                        ${problems.map((problem) => `- ${problem}`).join("\n")}

                        Please fix these issues and submit again.
                      `)
                    : "Ignored: only submit one configuration at a time.",
              })),
            },
          ],
          iteration + 1,
        );
      }

      chartConfig = args.config;
      explanation = args.explanation;
      return;
    }

    // No tool call - ask the LLM to try again
    return callModel(
      [
        ...messages,
        message,
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please use the submit_config tool to provide the chart configuration.",
            },
          ],
        },
      ],
      iteration + 1,
    );
  };

  try {
    await callModel(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                User's goal: "${userGoal}"
                ${
                  refinementInstruction && existingChartConfig
                    ? dedent(`
                        Refinement instruction: "${refinementInstruction}"

                        Existing chart configuration:
                        ${existingChartConfig}

                        Refine the existing chart configuration only as required. Preserve any
                        settings that remain appropriate.
                      `)
                    : ""
                }
                Chart type: ${chartType}

                Chart data (first 20 items):
                ${stringify(
                  Array.isArray(parsedChartData)
                    ? parsedChartData.slice(0, 20)
                    : parsedChartData,
                )}

                Data keys available: ${
                  Array.isArray(parsedChartData) &&
                  parsedChartData.length > 0 &&
                  parsedChartData[0]
                    ? Object.keys(parsedChartData[0] as object).join(", ")
                    : "unknown"
                }

                Generate an appropriate ECharts configuration for this data.
              `),
            },
          ],
        },
      ],
      1,
    );

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Variable set in recursive async function
    if (!chartConfig) {
      throw new Error("Failed to generate chart configuration");
    }

    const outputs: ActionOutputs = [
      {
        outputName: "chartConfig",
        payload: { kind: "Text", value: JSON.stringify(chartConfig) },
      },
      {
        outputName: "explanation",
        payload: { kind: "Text", value: explanation },
      },
    ];

    return {
      code: StatusCode.Ok,
      message: "Chart configuration generated successfully",
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
