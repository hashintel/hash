import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { ChartConfig } from "@local/hash-isomorphic-utils/dashboard-types";
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
 * Build the tool schema from the auto-generated ChartConfig JSON schema.
 * The schema is generated from TypeScript types via ts-json-schema-generator.
 *
 * We use JSON.parse(JSON.stringify(...)) to create a mutable deep copy
 * since the generated schema uses `as const`.
 */
const buildToolSchema = (): LlmToolDefinition<ToolName>["inputSchema"] => {
  // Deep clone to remove readonly modifiers from the generated schema
  const definitions = JSON.parse(
    JSON.stringify(chartConfigSchema.definitions),
  ) as {
    ChartConfig: Record<string, unknown>;
    EChartsSeriesConfig: Record<string, unknown>;
    ChartType: Record<string, unknown>;
  };

  // Inline the referenced definitions for the config property
  const chartConfigProps = definitions.ChartConfig.properties as Record<
    string,
    unknown
  >;
  const seriesConfigProps = definitions.EChartsSeriesConfig
    .properties as Record<string, unknown>;
  const seriesProp = chartConfigProps.series as Record<string, unknown>;

  const configSchema = {
    ...definitions.ChartConfig,
    properties: {
      ...chartConfigProps,
      series: {
        ...seriesProp,
        items: {
          ...definitions.EChartsSeriesConfig,
          properties: {
            ...seriesConfigProps,
            type: definitions.ChartType,
          },
        },
      },
    },
  };

  return {
    type: "object",
    properties: {
      config: configSchema,
      explanation: {
        type: "string",
        description: "Explanation of why this configuration was chosen",
      },
    },
    required: ["config", "explanation"],
    additionalProperties: false,
  };
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
                User's visualization goal: "${userGoal}"
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
    return {
      code: StatusCode.Internal,
      message: "Error calling LLM",
      contents: [],
    };
  }

  const { message } = llmResponse;
  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  const submitCall = toolCalls.find((tc) => tc.name === "submit_config");
  if (!submitCall) {
    // Generate a default config
    const sampleItem = Array.isArray(parsedChartData)
      ? parsedChartData[0]
      : parsedChartData;
    const keys = sampleItem ? Object.keys(sampleItem as object) : [];

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

    const outputs: ActionOutputs = [
      {
        outputName: "chartConfig",
        payload: { kind: "Text", value: JSON.stringify(defaultConfig) },
      },
      {
        outputName: "explanation",
        payload: {
          kind: "Text",
          value: "Generated default configuration based on data structure",
        },
      },
    ];

    return {
      code: StatusCode.Ok,
      message: "Generated default configuration",
      contents: [{ outputs }],
    };
  }

  const args = submitCall.input as {
    config: ChartConfig;
    explanation: string;
  };

  const outputs: ActionOutputs = [
    {
      outputName: "chartConfig",
      payload: { kind: "Text", value: JSON.stringify(args.config) },
    },
    {
      outputName: "explanation",
      payload: { kind: "Text", value: args.explanation },
    },
  ];

  return {
    code: StatusCode.Ok,
    message: "Chart configuration generated successfully",
    contents: [{ outputs }],
  };
};
