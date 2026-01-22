# Agent 2: AI Worker Activities

> **📋 Overview**: See [dashboard-overview.md](dashboard-overview.md) for the full feature context, architecture diagrams, and how this work stream relates to others.

## Mission

Create three Temporal activities for LLM-powered dashboard configuration:

1. Generate structured queries from natural language goals
2. Analyze query results and generate Python transformation scripts
3. Generate chart configurations

## Prerequisites

- Understanding of Temporal activities
- Familiarity with the existing `answer-question-action.ts` pattern
- Knowledge of the Graph API filter syntax

## Reference Files

- Pattern to follow: `apps/hash-ai-worker-ts/src/activities/flow-activities/answer-question-action.ts`
- GPT query patterns: `apps/hash-api/src/ai/gpt/gpt-query-entities.ts`
- Filter types: `libs/@local/graph/store/src/filter/mod.rs`
- Structural queries docs: `apps/hash-graph/docs/structural-queries.md`

## Files to Create/Modify

### Create

1. `apps/hash-ai-worker-ts/src/activities/flow-activities/generate-dashboard-query-action.ts`
2. `apps/hash-ai-worker-ts/src/activities/flow-activities/analyze-dashboard-data-action.ts`
3. `apps/hash-ai-worker-ts/src/activities/flow-activities/generate-chart-config-action.ts`

### Modify

1. `apps/hash-ai-worker-ts/src/activities/flow-activities.ts` - Register activities
2. `libs/@local/hash-isomorphic-utils/src/flows/action-definitions.ts` - Add definitions

---

## Detailed Implementation

### Activity 1: Generate Dashboard Query

Create `apps/hash-ai-worker-ts/src/activities/flow-activities/generate-dashboard-query-action.ts`:

```typescript
import type { Filter } from "@local/hash-graph-client";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import { queryEntityTypeSubgraph } from "@local/hash-graph-sdk/ontology";
import type {
  GenerateDashboardQueryInput,
  GenerateDashboardQueryOutput,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { logger } from "../shared/activity-logger.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import {
  getToolCallsFromLlmAssistantMessage,
  mapLlmMessageToOpenAiMessages,
  mapOpenAiMessagesToLlmMessages,
} from "../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { openAiSeed } from "../shared/open-ai-seed.js";
import type { PermittedOpenAiModel } from "../shared/openai-client.js";
import { stringify } from "../shared/stringify.js";

const model: PermittedOpenAiModel = "gpt-4o-2024-08-06";

const systemPrompt = dedent(`
  You are an expert at constructing database queries. You help users create queries to retrieve
  data from a knowledge graph for visualization in charts and dashboards.

  The knowledge graph stores "entities" which have types, properties, and links to other entities.
  You construct "structural queries" using a filter syntax that supports:
  - equal: Exact match on a path
  - notEqual: Not equal to a value
  - any: Match any of the conditions (OR)
  - all: Match all conditions (AND)
  - not: Negate a condition
  - greater, greaterOrEqual, less, lessOrEqual: Numeric comparisons
  - startsWith, endsWith, containsSegment: String operations

  Common filter paths for entities:
  - ["uuid"] - Entity's unique identifier
  - ["webId"] - The web (namespace) the entity belongs to
  - ["type", "baseUrl"] - Filter by entity type base URL
  - ["type", "title"] - Filter by entity type title
  - ["properties", "<baseUrl>"] - Filter by a property value
  - ["archived"] - Whether the entity is archived
  - ["leftEntity", ...] - For link entities, the source entity
  - ["rightEntity", ...] - For link entities, the target entity

  You first explore what entity types are available, then construct a query that will
  retrieve the data needed for the user's visualization goal.

  You test your query to see what data it returns, and iterate until the results look correct.
`);

const tools: LlmToolDefinition[] = [
  {
    name: "get_entity_types",
    description:
      "Retrieve available entity types to understand what data can be queried. Returns type titles, descriptions, and property schemas.",
    inputSchema: {
      type: "object",
      properties: {
        searchQuery: {
          type: "string",
          description:
            "Optional: semantic search query to find relevant entity types",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "test_query",
    description:
      "Execute a structural query and see the results. Use this to validate your query returns the expected data.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "object",
          description: "The filter object for the structural query",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 10)",
        },
      },
      required: ["filter"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_query",
    description:
      "Submit the final query once you're satisfied it returns the correct data for the user's goal.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "object",
          description: "The final filter object for the structural query",
        },
        explanation: {
          type: "string",
          description:
            "Explanation of what the query does and why it suits the user's goal",
        },
        suggestedChartTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["bar", "line", "area", "pie", "scatter", "radar", "composed"],
          },
          description:
            "Suggested chart types that would work well with this data",
        },
      },
      required: ["filter", "explanation", "suggestedChartTypes"],
      additionalProperties: false,
    },
  },
];

const maximumIterations = 8;

export const generateDashboardQueryAction = async (
  input: GenerateDashboardQueryInput,
): Promise<Status<GenerateDashboardQueryOutput>> => {
  const { userGoal, webId } = input;
  const { userAuthentication, stepId, flowEntityId } = await getFlowContext();

  const callModel = async (
    messages: Parameters<typeof getLlmResponse>[0]["messages"],
    iteration: number,
  ): Promise<Status<GenerateDashboardQueryOutput>> => {
    if (iteration > maximumIterations) {
      return {
        code: StatusCode.ResourceExhausted,
        message: `Exceeded maximum iterations (${maximumIterations})`,
        contents: [],
      };
    }

    const llmResponse = await getLlmResponse(
      {
        model,
        systemPrompt,
        messages,
        temperature: 0,
        seed: openAiSeed,
        tools,
      },
      {
        customMetadata: {
          stepId,
          taskName: "generate-dashboard-query",
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

    for (const toolCall of toolCalls) {
      const args = toolCall.input as Record<string, unknown>;

      switch (toolCall.name) {
        case "get_entity_types": {
          // Fetch entity types available in the user's web
          const { subgraph } = await queryEntityTypeSubgraph(
            { graphApi: graphApiClient },
            userAuthentication,
            {
              filter: webId
                ? { equal: [{ path: ["webId"] }, { parameter: webId }] }
                : { all: [] },
              temporalAxes: currentTimeInstantTemporalAxes,
              graphResolveDepths: almostFullOntologyResolveDepths,
              traversalPaths: [],
            },
          );

          // Extract and simplify entity types for LLM
          const entityTypes = Object.values(subgraph.vertices)
            .flatMap((v) => Object.values(v))
            .filter((v) => v.kind === "entityType")
            .map((v) => ({
              title: v.inner.schema.title,
              description: v.inner.schema.description,
              properties: Object.keys(v.inner.schema.properties || {}),
            }));

          return callModel(
            [
              ...messages,
              ...mapLlmMessageToOpenAiMessages({ message }),
              {
                role: "tool",
                content: `Available entity types:\n${stringify(entityTypes)}`,
                tool_call_id: toolCall.id,
              },
            ],
            iteration + 1,
          );
        }

        case "test_query": {
          const filter = args.filter as Filter;
          const limit = (args.limit as number) ?? 10;

          try {
            const { subgraph } = await queryEntitySubgraph(
              { graphApi: graphApiClient },
              userAuthentication,
              {
                filter,
                temporalAxes: currentTimeInstantTemporalAxes,
                graphResolveDepths: almostFullOntologyResolveDepths,
                traversalPaths: [],
                includeDrafts: false,
                limit,
                includePermissions: false,
              },
            );

            // Extract root entities
            const entities = Object.values(subgraph.vertices)
              .flatMap((v) => Object.values(v))
              .filter((v) => v.kind === "entity")
              .slice(0, limit)
              .map((v) => ({
                entityId: v.inner.metadata.recordId.entityId,
                type: v.inner.metadata.entityTypeIds,
                properties: v.inner.properties,
              }));

            return callModel(
              [
                ...messages,
                ...mapLlmMessageToOpenAiMessages({ message }),
                {
                  role: "tool",
                  content: `Query returned ${entities.length} entities:\n${stringify(entities)}`,
                  tool_call_id: toolCall.id,
                },
              ],
              iteration + 1,
            );
          } catch (error) {
            return callModel(
              [
                ...messages,
                ...mapLlmMessageToOpenAiMessages({ message }),
                {
                  role: "tool",
                  content: `Query error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  tool_call_id: toolCall.id,
                },
              ],
              iteration + 1,
            );
          }
        }

        case "submit_query": {
          const filter = args.filter as Filter;
          const explanation = args.explanation as string;
          const suggestedChartTypes = args.suggestedChartTypes as ChartType[];

          // Execute query one more time to get sample data
          const { subgraph } = await queryEntitySubgraph(
            { graphApi: graphApiClient },
            userAuthentication,
            {
              filter,
              temporalAxes: currentTimeInstantTemporalAxes,
              graphResolveDepths: almostFullOntologyResolveDepths,
              traversalPaths: [],
              includeDrafts: false,
              limit: 100,
              includePermissions: false,
            },
          );

          const sampleData = Object.values(subgraph.vertices)
            .flatMap((v) => Object.values(v))
            .filter((v) => v.kind === "entity")
            .slice(0, 20)
            .map((v) => v.inner);

          return {
            code: StatusCode.Ok,
            message: "Query generated successfully",
            contents: [
              {
                structuredQuery: filter,
                explanation,
                sampleData,
                suggestedChartTypes,
              },
            ],
          };
        }

        default: {
          return callModel(
            [
              ...messages,
              ...mapLlmMessageToOpenAiMessages({ message }),
              {
                role: "user",
                content: `Unknown tool: ${toolCall.name}. Please use one of the available tools.`,
              },
            ],
            iteration + 1,
          );
        }
      }
    }

    // No tool calls - prompt to use a tool
    return callModel(
      [
        ...messages,
        ...mapLlmMessageToOpenAiMessages({ message }),
        {
          role: "user",
          content:
            "Please use one of the available tools to explore entity types, test a query, or submit your final query.",
        },
      ],
      iteration + 1,
    );
  };

  return callModel(
    [
      {
        role: "user",
        content: dedent(`
          User's visualization goal: "${userGoal}"

          Web ID (namespace): ${webId}

          Please:
          1. First explore available entity types using get_entity_types
          2. Construct a query that will retrieve the data needed for this visualization
          3. Test your query to verify it returns appropriate data
          4. Submit your final query when satisfied
        `),
      },
    ],
    1,
  );
};
```

### Activity 2: Analyze Dashboard Data

Create `apps/hash-ai-worker-ts/src/activities/flow-activities/analyze-dashboard-data-action.ts`:

```typescript
import type { Filter } from "@local/hash-graph-client";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import type {
  AnalyzeDashboardDataInput,
  AnalyzeDashboardDataOutput,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { CodeInterpreter } from "e2b";

import { logger } from "../shared/activity-logger.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import {
  getToolCallsFromLlmAssistantMessage,
  mapLlmMessageToOpenAiMessages,
  mapOpenAiMessagesToLlmMessages,
} from "../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { openAiSeed } from "../shared/open-ai-seed.js";
import type { PermittedOpenAiModel } from "../shared/openai-client.js";
import { stringify } from "../shared/stringify.js";

const model: PermittedOpenAiModel = "gpt-4o-2024-08-06";

const systemPrompt = dedent(`
  You are an expert data analyst. Your job is to transform raw entity data from a knowledge graph
  into a format suitable for chart visualization.

  You will receive:
  1. A structured query filter that retrieves entities
  2. The user's visualization goal
  3. A target chart type (or you'll suggest one)

  Your task is to write Python code that:
  1. Loads the entity data (provided as JSON)
  2. Processes, aggregates, or transforms it as needed
  3. Outputs a JSON array suitable for the chart library (Recharts)

  Recharts data format examples:
  - Bar/Line/Area: [{ name: "Category A", value: 100 }, { name: "Category B", value: 200 }]
  - Pie: [{ name: "Slice 1", value: 400 }, { name: "Slice 2", value: 300 }]
  - Multi-series: [{ name: "Jan", sales: 100, revenue: 200 }, { name: "Feb", sales: 150, revenue: 250 }]

  Your Python code should print the final JSON array to stdout.
  Include comments explaining your data transformation logic.
`);

const tools: LlmToolDefinition[] = [
  {
    name: "run_python",
    description:
      "Execute Python code to transform the entity data. The code should print JSON to stdout.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "Python code that processes the data and prints JSON to stdout",
        },
        explanation: {
          type: "string",
          description: "Explanation of what the code does",
        },
      },
      required: ["code", "explanation"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_result",
    description:
      "Submit the final Python script and chart data once you're satisfied with the transformation.",
    inputSchema: {
      type: "object",
      properties: {
        pythonScript: {
          type: "string",
          description: "The final Python script for data transformation",
        },
        suggestedChartType: {
          type: "string",
          enum: ["bar", "line", "area", "pie", "scatter", "radar", "composed"],
          description: "The recommended chart type for this data",
        },
        explanation: {
          type: "string",
          description: "Explanation of the data transformation approach",
        },
      },
      required: ["pythonScript", "suggestedChartType", "explanation"],
      additionalProperties: false,
    },
  },
];

const runPythonCode = async (
  code: string,
  dataFilePath: string,
): Promise<{ stdout: string; stderr: string }> => {
  const sandbox = await CodeInterpreter.create();

  try {
    const response = await sandbox.runPython(code);
    return {
      stdout: response.stdout,
      stderr: response.stderr,
    };
  } finally {
    await sandbox.close();
  }
};

const maximumIterations = 8;

export const analyzeDashboardDataAction = async (
  input: AnalyzeDashboardDataInput,
): Promise<Status<AnalyzeDashboardDataOutput>> => {
  const { structuredQuery, userGoal, targetChartType, webId } = input;
  const { userAuthentication, stepId, flowEntityId } = await getFlowContext();

  // First, execute the query to get entity data
  const { subgraph } = await queryEntitySubgraph(
    { graphApi: graphApiClient },
    userAuthentication,
    {
      filter: structuredQuery,
      temporalAxes: currentTimeInstantTemporalAxes,
      graphResolveDepths: almostFullOntologyResolveDepths,
      traversalPaths: [],
      includeDrafts: false,
      includePermissions: false,
    },
  );

  // Convert to simple graph format for LLM
  const { entities: simpleEntities, entityTypes } = getSimpleGraph(subgraph);
  const entityDataJson = JSON.stringify({
    entities: simpleEntities,
    entityTypes,
  });

  // Upload data to sandbox
  const requestId = Context.current().info.workflowExecution.workflowId;
  const sandbox = await CodeInterpreter.create();
  const dataFilePath = await sandbox.uploadFile(
    Buffer.from(entityDataJson),
    `${requestId}_data.json`,
  );
  await sandbox.close();

  let lastSuccessfulScript: string | null = null;
  let lastSuccessfulOutput: unknown[] | null = null;

  const callModel = async (
    messages: Parameters<typeof getLlmResponse>[0]["messages"],
    iteration: number,
  ): Promise<Status<AnalyzeDashboardDataOutput>> => {
    if (iteration > maximumIterations) {
      if (lastSuccessfulScript && lastSuccessfulOutput) {
        return {
          code: StatusCode.Ok,
          message: "Used last successful script after max iterations",
          contents: [
            {
              pythonScript: lastSuccessfulScript,
              chartData: lastSuccessfulOutput,
              suggestedChartType: targetChartType ?? "bar",
              explanation: "Auto-submitted after reaching iteration limit",
            },
          ],
        };
      }
      return {
        code: StatusCode.ResourceExhausted,
        message: `Exceeded maximum iterations (${maximumIterations})`,
        contents: [],
      };
    }

    const llmResponse = await getLlmResponse(
      {
        model,
        systemPrompt,
        messages,
        temperature: 0,
        seed: openAiSeed,
        tools,
      },
      {
        customMetadata: {
          stepId,
          taskName: "analyze-dashboard-data",
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

    for (const toolCall of toolCalls) {
      const args = toolCall.input as Record<string, unknown>;

      switch (toolCall.name) {
        case "run_python": {
          const code = args.code as string;
          const explanation = args.explanation as string;

          logger.debug(`Running Python code:\n${code}\nExplanation: ${explanation}`);

          const { stdout, stderr } = await runPythonCode(code, dataFilePath);

          if (stderr) {
            return callModel(
              [
                ...messages,
                ...mapLlmMessageToOpenAiMessages({ message }),
                {
                  role: "tool",
                  content: `Error running code: ${stderr}\n\nPlease fix the error and try again.`,
                  tool_call_id: toolCall.id,
                },
              ],
              iteration + 1,
            );
          }

          // Try to parse the output as JSON
          try {
            const chartData = JSON.parse(stdout.trim());
            lastSuccessfulScript = code;
            lastSuccessfulOutput = chartData;

            return callModel(
              [
                ...messages,
                ...mapLlmMessageToOpenAiMessages({ message }),
                {
                  role: "tool",
                  content: dedent(`
                    Code executed successfully!

                    Output (first 5 items):
                    ${stringify(Array.isArray(chartData) ? chartData.slice(0, 5) : chartData)}

                    Total items: ${Array.isArray(chartData) ? chartData.length : 1}

                    If this looks correct for the visualization goal, submit your final result.
                    Otherwise, adjust your code and run again.
                  `),
                  tool_call_id: toolCall.id,
                },
              ],
              iteration + 1,
            );
          } catch {
            return callModel(
              [
                ...messages,
                ...mapLlmMessageToOpenAiMessages({ message }),
                {
                  role: "tool",
                  content: `Output is not valid JSON: ${stdout}\n\nPlease ensure your code prints valid JSON to stdout.`,
                  tool_call_id: toolCall.id,
                },
              ],
              iteration + 1,
            );
          }
        }

        case "submit_result": {
          const pythonScript = args.pythonScript as string;
          const suggestedChartType = args.suggestedChartType as ChartType;
          const explanation = args.explanation as string;

          // Run the final script to get the chart data
          const { stdout, stderr } = await runPythonCode(
            pythonScript,
            dataFilePath,
          );

          if (stderr) {
            return callModel(
              [
                ...messages,
                ...mapLlmMessageToOpenAiMessages({ message }),
                {
                  role: "tool",
                  content: `Final script has errors: ${stderr}\n\nPlease fix and try again.`,
                  tool_call_id: toolCall.id,
                },
              ],
              iteration + 1,
            );
          }

          try {
            const chartData = JSON.parse(stdout.trim());
            return {
              code: StatusCode.Ok,
              message: "Data analysis completed successfully",
              contents: [
                {
                  pythonScript,
                  chartData,
                  suggestedChartType,
                  explanation,
                },
              ],
            };
          } catch {
            return callModel(
              [
                ...messages,
                ...mapLlmMessageToOpenAiMessages({ message }),
                {
                  role: "tool",
                  content: `Final script output is not valid JSON. Please fix and try again.`,
                  tool_call_id: toolCall.id,
                },
              ],
              iteration + 1,
            );
          }
        }
      }
    }

    // No tool calls
    return callModel(
      [
        ...messages,
        ...mapLlmMessageToOpenAiMessages({ message }),
        {
          role: "user",
          content: "Please use the run_python tool to transform the data, or submit_result when done.",
        },
      ],
      iteration + 1,
    );
  };

  return callModel(
    [
      {
        role: "user",
        content: dedent(`
          User's visualization goal: "${userGoal}"
          ${targetChartType ? `Target chart type: ${targetChartType}` : "Please suggest an appropriate chart type."}

          Entity data is available at: ${dataFilePath}

          Sample of the data structure:
          ${stringify(simpleEntities.slice(0, 3))}

          Available entity types:
          ${stringify(entityTypes)}

          Please write Python code to:
          1. Load the JSON data from the file
          2. Transform it into a format suitable for Recharts
          3. Print the result as JSON to stdout
        `),
      },
    ],
    1,
  );
};
```

### Activity 3: Generate Chart Config

Create `apps/hash-ai-worker-ts/src/activities/flow-activities/generate-chart-config-action.ts`:

```typescript
import type {
  ChartConfig,
  ChartType,
  GenerateChartConfigInput,
  GenerateChartConfigOutput,
} from "@local/hash-isomorphic-utils/dashboard-types";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import {
  getToolCallsFromLlmAssistantMessage,
  mapLlmMessageToOpenAiMessages,
} from "../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { openAiSeed } from "../shared/open-ai-seed.js";
import type { PermittedOpenAiModel } from "../shared/openai-client.js";
import { stringify } from "../shared/stringify.js";

const model: PermittedOpenAiModel = "gpt-4o-2024-08-06";

const systemPrompt = dedent(`
  You are an expert at data visualization. Your job is to generate configuration for Recharts
  components based on the chart data and user's goal.

  Recharts configuration options:

  For all charts:
  - xAxisKey: The data key for the X axis (usually "name" or a category field)
  - yAxisKey: The data key for the Y axis (for single-series charts)
  - dataKeys: Array of data keys (for multi-series charts)
  - colors: Array of hex colors for the series
  - showLegend: Whether to show the legend (default true for multi-series)
  - showGrid: Whether to show grid lines (default true)
  - showTooltip: Whether to show tooltips on hover (default true)
  - xAxisLabel: Label for X axis
  - yAxisLabel: Label for Y axis

  For bar charts:
  - stacked: Whether bars should be stacked

  For area charts:
  - stacked: Whether areas should be stacked

  For pie charts:
  - innerRadius: Inner radius (0 for pie, >0 for donut)
  - outerRadius: Outer radius (default 80)

  Generate a configuration that makes the data easy to understand and visually appealing.
`);

const tools: LlmToolDefinition[] = [
  {
    name: "submit_config",
    description: "Submit the chart configuration",
    inputSchema: {
      type: "object",
      properties: {
        config: {
          type: "object",
          description: "The chart configuration object",
          properties: {
            xAxisKey: { type: "string" },
            yAxisKey: { type: "string" },
            xAxisLabel: { type: "string" },
            yAxisLabel: { type: "string" },
            dataKeys: { type: "array", items: { type: "string" } },
            colors: { type: "array", items: { type: "string" } },
            showLegend: { type: "boolean" },
            showGrid: { type: "boolean" },
            showTooltip: { type: "boolean" },
            stacked: { type: "boolean" },
            innerRadius: { type: "number" },
            outerRadius: { type: "number" },
          },
        },
        explanation: {
          type: "string",
          description: "Explanation of why this configuration was chosen",
        },
      },
      required: ["config", "explanation"],
      additionalProperties: false,
    },
  },
];

export const generateChartConfigAction = async (
  input: GenerateChartConfigInput,
): Promise<Status<GenerateChartConfigOutput>> => {
  const { chartData, chartType, userGoal } = input;
  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      model,
      systemPrompt,
      messages: [
        {
          role: "user",
          content: dedent(`
            User's visualization goal: "${userGoal}"
            Chart type: ${chartType}

            Chart data (first 5 items):
            ${stringify(Array.isArray(chartData) ? chartData.slice(0, 5) : chartData)}

            Data keys available: ${Array.isArray(chartData) && chartData.length > 0 ? Object.keys(chartData[0] as object).join(", ") : "unknown"}

            Please generate an appropriate Recharts configuration for this data.
          `),
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
    const sampleItem = Array.isArray(chartData) ? chartData[0] : chartData;
    const keys = sampleItem ? Object.keys(sampleItem as object) : [];

    const defaultConfig: ChartConfig = {
      xAxisKey: keys[0] ?? "name",
      yAxisKey: keys[1] ?? "value",
      showLegend: true,
      showGrid: true,
      showTooltip: true,
      colors: ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088fe"],
    };

    return {
      code: StatusCode.Ok,
      message: "Generated default configuration",
      contents: [
        {
          chartConfig: defaultConfig,
          explanation: "Generated default configuration based on data structure",
        },
      ],
    };
  }

  const args = submitCall.input as {
    config: ChartConfig;
    explanation: string;
  };

  return {
    code: StatusCode.Ok,
    message: "Chart configuration generated successfully",
    contents: [
      {
        chartConfig: args.config,
        explanation: args.explanation,
      },
    ],
  };
};
```

### Step 4: Register Activities

Modify `apps/hash-ai-worker-ts/src/activities/flow-activities.ts`:

```typescript
// Add imports
import { generateDashboardQueryAction } from "./flow-activities/generate-dashboard-query-action.js";
import { analyzeDashboardDataAction } from "./flow-activities/analyze-dashboard-data-action.js";
import { generateChartConfigAction } from "./flow-activities/generate-chart-config-action.js";

// Add to createFlowActionActivities object:
export const createFlowActionActivities: CreateFlowActivities<
  AiFlowActionDefinitionId
> = {
  // ... existing activities ...
  generateDashboardQueryAction,
  analyzeDashboardDataAction,
  generateChartConfigAction,
};
```

### Step 5: Add Action Definitions

Modify `libs/@local/hash-isomorphic-utils/src/flows/action-definitions.ts`:

```typescript
// Add to AiFlowActionDefinitionId type:
export type AiFlowActionDefinitionId =
  | "answerQuestion"
  // ... existing ...
  | "generateDashboardQuery"
  | "analyzeDashboardData"
  | "generateChartConfig";

// Add to aiFlowActionDefinitionsAsConst:
generateDashboardQuery: {
  actionDefinitionId: "generateDashboardQuery",
  name: "Generate Dashboard Query",
  description: "Generate a structural query for dashboard data based on a natural language goal.",
  kind: "action",
  inputs: [
    {
      oneOfPayloadKinds: ["Text"],
      name: "userGoal",
      required: true,
      array: false,
    },
  ],
  outputs: [
    {
      payloadKind: "Text",
      name: "structuredQuery",
      description: "The generated structural query as JSON",
      array: false,
      required: true,
    },
    {
      payloadKind: "Text",
      name: "explanation",
      array: false,
      required: true,
    },
  ],
},
analyzeDashboardData: {
  actionDefinitionId: "analyzeDashboardData",
  name: "Analyze Dashboard Data",
  description: "Transform query results into chart-ready data using Python.",
  kind: "action",
  inputs: [
    {
      oneOfPayloadKinds: ["Text"],
      name: "structuredQuery",
      required: true,
      array: false,
    },
    {
      oneOfPayloadKinds: ["Text"],
      name: "userGoal",
      required: true,
      array: false,
    },
    {
      oneOfPayloadKinds: ["Text"],
      name: "targetChartType",
      required: false,
      array: false,
    },
  ],
  outputs: [
    {
      payloadKind: "Text",
      name: "pythonScript",
      array: false,
      required: true,
    },
    {
      payloadKind: "Text",
      name: "chartData",
      description: "The transformed chart data as JSON",
      array: false,
      required: true,
    },
    {
      payloadKind: "Text",
      name: "suggestedChartType",
      array: false,
      required: true,
    },
  ],
},
generateChartConfig: {
  actionDefinitionId: "generateChartConfig",
  name: "Generate Chart Config",
  description: "Generate Recharts configuration for the chart data.",
  kind: "action",
  inputs: [
    {
      oneOfPayloadKinds: ["Text"],
      name: "chartData",
      required: true,
      array: false,
    },
    {
      oneOfPayloadKinds: ["Text"],
      name: "chartType",
      required: true,
      array: false,
    },
    {
      oneOfPayloadKinds: ["Text"],
      name: "userGoal",
      required: true,
      array: false,
    },
  ],
  outputs: [
    {
      payloadKind: "Text",
      name: "chartConfig",
      description: "The chart configuration as JSON",
      array: false,
      required: true,
    },
    {
      payloadKind: "Text",
      name: "explanation",
      array: false,
      required: true,
    },
  ],
},
```

---

## Completion Criteria

- [ ] Three activity files created and compile without errors
- [ ] Activities registered in `flow-activities.ts`
- [ ] Action definitions added to `action-definitions.ts`
- [ ] Types import correctly from `@local/hash-isomorphic-utils/dashboard-types`
- [ ] `yarn lint:tsc` passes in `apps/hash-ai-worker-ts`

## Interface for Other Agents

These activities will be called via Temporal workflows. The API layer (Agent 3) will create a workflow that orchestrates these activities.

## Testing

Create a simple test by manually calling the activities:

```typescript
// Test generate query
const queryResult = await generateDashboardQueryAction({
  userGoal: "Show top 10 flights by scheduled departure time",
  webId: testWebId,
});

// Test data analysis
const analysisResult = await analyzeDashboardDataAction({
  structuredQuery: queryResult.contents[0].structuredQuery,
  userGoal: "Show top 10 flights by scheduled departure time",
  webId: testWebId,
});

// Test chart config
const configResult = await generateChartConfigAction({
  chartData: analysisResult.contents[0].chartData,
  chartType: analysisResult.contents[0].suggestedChartType,
  userGoal: "Show top 10 flights by scheduled departure time",
});
```
