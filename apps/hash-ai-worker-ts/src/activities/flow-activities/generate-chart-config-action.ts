/**
 * Flow activity for generating chart configuration.
 * This activity generates Apache ECharts configuration based on chart data and user goal.
 */
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { openAiSeed } from "../shared/open-ai-seed.js";
import type { PermittedOpenAiModel } from "../shared/openai-client.js";
import { stringify } from "../shared/stringify.js";
import { chartConfigSchema } from "./chart-config-schema.gen.js";

const model: PermittedOpenAiModel = "gpt-4o-2024-08-06";

const systemPrompt = dedent(`
  You are an expert at data visualization. Your job is to generate configuration for Apache ECharts
  based on the chart data and user's goal.
`);

type ToolName = "submit_config";

/**
 * Build the tool schema for chart configuration.
 * Uses the auto-generated schema from ChartConfig type.
 */
const buildToolSchema = (): LlmToolDefinition<ToolName>["inputSchema"] => {
  // The OpenAI JSONSchema type doesn't include $ref/$defs but OpenAI's API supports them
  return {
    type: "object",
    properties: {
      config: {
        $ref: "#/$defs/ChartConfig",
        description: "The chart configuration object",
      },
      explanation: {
        type: "string",
        description: "Explanation of why this configuration was chosen",
      },
    },
    required: ["config", "explanation"],
    additionalProperties: false,
    // Include definitions from the generated schema, using $defs (OpenAI's preferred format)
    $defs: chartConfigSchema.definitions,
  } as LlmToolDefinition<ToolName>["inputSchema"];
};

const tools: LlmToolDefinition<ToolName>[] = [
  {
    name: "submit_config",
    description: "Submit the ECharts configuration",
    inputSchema: buildToolSchema(),
  },
];

type ActionOutputs = AiActionStepOutput<"generateChartConfig">[];

export const generateChartConfigAction: AiFlowActionActivity<
  "generateChartConfig"
> = async ({ inputs }) => {
  const { chartData, chartType, userGoal } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "generateChartConfig",
  }) as {
    [K in InputNameForAiFlowAction<"generateChartConfig">]: string;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

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

  try {
    const llmResponse = await getLlmResponse(
      {
        model,
        systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: dedent(`
                  User's goal: "${userGoal}"
                  Chart type: ${chartType}

                  Chart data (first 5 items):
                  ${stringify(Array.isArray(parsedChartData) ? parsedChartData.slice(0, 5) : parsedChartData)}

                  Data keys available: ${Array.isArray(parsedChartData) && parsedChartData.length > 0 && parsedChartData[0] ? Object.keys(parsedChartData[0] as object).join(", ") : "unknown"}

                  Generate an appropriate ECharts configuration for this data.
                `),
              },
            ],
          },
        ],
        temperature: 0,
        seed: openAiSeed,
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Type narrowing from tool definition
    const submitCall = toolCalls.find((tc) => tc.name === "submit_config");

    let chartConfig: ChartConfig;
    let explanation: string;

    if (submitCall) {
      const args = submitCall.input as {
        config: ChartConfig;
        explanation: string;
      };
      chartConfig = args.config;
      explanation = args.explanation;
    } else {
      // Generate a default config if LLM didn't provide one
      const sampleItem =
        Array.isArray(parsedChartData) && parsedChartData.length > 0
          ? parsedChartData[0]
          : null;
      const keys = sampleItem
        ? Object.keys(sampleItem as object)
        : ["name", "value"];

      chartConfig = {
        categoryKey: keys[0] ?? "name",
        series: [
          {
            type: chartType as ChartType,
            name: "Value",
            dataKey: keys[1] ?? "value",
          },
        ],
        showLegend: true,
        showGrid: true,
        showTooltip: true,
        colors: ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088fe"],
      };
      explanation = "Generated default configuration based on data structure";
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
