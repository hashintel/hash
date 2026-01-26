import type {
  ActorEntityUuid,
  EntityId,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import dedent from "dedent";

import { chartConfigSchema } from "../flow-activities/chart-config-schema.gen.js";
import { getLlmResponse } from "./get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "./get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "./get-llm-response/types.js";
import { openAiSeed } from "./open-ai-seed.js";
import type { PermittedOpenAiModel } from "./openai-client.js";
import { stringify } from "./stringify.js";

const model: PermittedOpenAiModel = "gpt-4o-2024-08-06";

const systemPrompt = dedent(`
  You are an expert at data visualization. Your job is to generate configuration for Apache ECharts
  based on the chart data and user's goal.

  Reference: https://echarts.apache.org/en/option.html

  Examples:

  Bar chart: { "categoryKey": "name", "series": [{ "type": "bar", "dataKey": "value" }] }

  Multi-series line: { "categoryKey": "month", "series": [{ "type": "line", "dataKey": "revenue" }, { "type": "line", "dataKey": "profit", "smooth": true }], "showLegend": true }

  Stacked bar: { "categoryKey": "category", "series": [{ "type": "bar", "dataKey": "a", "stack": "total" }, { "type": "bar", "dataKey": "b", "stack": "total" }] }

  Pie: { "categoryKey": "name", "series": [{ "type": "pie", "dataKey": "value", "radius": "50%" }] }

  Donut: { "categoryKey": "name", "series": [{ "type": "pie", "dataKey": "value", "radius": ["40%", "70%"] }] }

  Heatmap: { "categoryKey": "x", "series": [{ "type": "heatmap", "dataKey": "value" }] }

  Generate a configuration that makes the data easy to understand and visually appealing.
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

export type GenerateChartConfigParams = {
  chartData: unknown[];
  chartType: ChartType;
  userGoal: string;
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  webId: WebId;
  /** Entity ID to attribute LLM costs to */
  incurredInEntityId?: EntityId;
  /** Step ID for logging/tracking */
  stepId?: string;
};

export type GenerateChartConfigResult = {
  chartConfig: ChartConfig;
  explanation: string;
};

/**
 * Generate chart configuration based on chart data and user goal.
 */
export const generateChartConfig = async (
  params: GenerateChartConfigParams,
): Promise<GenerateChartConfigResult> => {
  const {
    chartData,
    chartType,
    userGoal,
    authentication,
    graphApiClient,
    webId,
    incurredInEntityId,
    stepId,
  } = params;

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
                ${stringify(Array.isArray(chartData) ? chartData.slice(0, 5) : chartData)}

                Data keys available: ${Array.isArray(chartData) && chartData.length > 0 && chartData[0] ? Object.keys(chartData[0] as object).join(", ") : "unknown"}

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
        stepId: stepId ?? "generate-chart-config",
        taskName: "chart-config",
      },
      userAccountId: authentication.actorId as UserId,
      graphApiClient,
      incurredInEntities: incurredInEntityId
        ? [{ entityId: incurredInEntityId }]
        : [],
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

  if (submitCall) {
    const args = submitCall.input as {
      config: ChartConfig;
      explanation: string;
    };
    return {
      chartConfig: args.config,
      explanation: args.explanation,
    };
  }

  // Generate a default config if LLM didn't provide one
  const sampleItem =
    Array.isArray(chartData) && chartData.length > 0 ? chartData[0] : null;
  const keys = sampleItem
    ? Object.keys(sampleItem as object)
    : ["name", "value"];

  const defaultConfig: ChartConfig = {
    categoryKey: keys[0] ?? "name",
    series: [
      {
        type: chartType,
        name: "Value",
        dataKey: keys[1] ?? "value",
      },
    ],
    showLegend: true,
    showGrid: true,
    showTooltip: true,
    colors: ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088fe"],
  };

  return {
    chartConfig: defaultConfig,
    explanation: "Generated default configuration based on data structure",
  };
};
