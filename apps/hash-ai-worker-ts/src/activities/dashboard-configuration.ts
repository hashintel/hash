import type {
  ActorEntityUuid,
  EntityId,
  PropertyPatchOperation,
  ProvidedEntityEditionProvenance,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import { splitEntityId } from "@blockprotocol/type-system";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import type { Filter, GraphApi } from "@local/hash-graph-client";
import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import { queryEntityTypeSubgraph } from "@local/hash-graph-sdk/entity-type";
import type {
  ChartConfig,
  ChartType,
} from "@local/hash-isomorphic-utils/dashboard-types";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { DashboardItem } from "@local/hash-isomorphic-utils/system-types/dashboard";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { CodeInterpreter } from "e2b";

import { logger } from "./shared/activity-logger.js";
import { getLlmResponse } from "./shared/get-llm-response.js";
import {
  getToolCallsFromLlmAssistantMessage,
  mapLlmMessageToOpenAiMessages,
  mapOpenAiMessagesToLlmMessages,
} from "./shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "./shared/get-llm-response/types.js";
import { openAiSeed } from "./shared/open-ai-seed.js";
import type { PermittedOpenAiModel } from "./shared/openai-client.js";
import { stringify } from "./shared/stringify.js";

const model: PermittedOpenAiModel = "gpt-4o-2024-08-06";

type AuthenticationContext = {
  actorId: ActorEntityUuid;
};

type ConfigureDashboardItemParams = {
  authentication: AuthenticationContext;
  itemEntityId: EntityId;
  webId: WebId;
};

type UpdateDashboardItemStatusParams = {
  authentication: AuthenticationContext;
  itemEntityId: EntityId;
  status: string;
  errorMessage?: string;
};

const getEntityById = async (
  graphApiClient: GraphApi,
  authentication: AuthenticationContext,
  entityId: EntityId,
): Promise<HashEntity> => {
  const [webId, entityUuid] = splitEntityId(entityId);

  const {
    entities: [entity, ...unexpectedEntities],
  } = await queryEntities({ graphApi: graphApiClient }, authentication, {
    filter: {
      all: [
        { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
        { equal: [{ path: ["webId"] }, { parameter: webId }] },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: false,
    includePermissions: false,
  });

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: Entity with entityId ${entityId} returned more than one result.`,
    );
  }

  if (!entity) {
    throw new Error(
      `Critical: Entity with entityId ${entityId} doesn't exist or cannot be accessed.`,
    );
  }

  return entity;
};

const defaultProvenance: ProvidedEntityEditionProvenance = {
  actorType: "machine",
  origin: { type: "flow" },
};

// ============================================================================
// Step 1: Generate Structural Query
// ============================================================================

const queryGenerationSystemPrompt = dedent(`
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
  - ["properties", "<baseUrl>", "<value>"] - Filter by a property value
  - ["archived"] - Whether the entity is archived

  You first explore what entity types are available, then construct a query.
  You test your query to see what data it returns, and iterate until correct.
`);

type QueryToolName = "get_entity_types" | "test_query" | "submit_query";

const queryTools: LlmToolDefinition<QueryToolName>[] = [
  {
    name: "get_entity_types",
    description:
      "Retrieve available entity types to understand what data can be queried.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "test_query",
    description: "Execute a structural query and see the results.",
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
    description: "Submit the final query once you're satisfied with results.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "object",
          description: "The final filter object",
        },
        explanation: {
          type: "string",
          description: "Explanation of what the query does",
        },
        suggestedChartType: {
          type: "string",
          enum: ["bar", "line", "pie", "scatter", "heatmap"],
          description: "Suggested chart type for this data",
        },
      },
      required: ["filter", "explanation", "suggestedChartType"],
      additionalProperties: false,
    },
  },
];

// ============================================================================
// Step 2: Analyze Data & Generate Python Script
// ============================================================================

const dataAnalysisSystemPrompt = dedent(`
  You are an expert data analyst. Your job is to transform raw entity data from a knowledge graph
  into a format suitable for chart visualization with Apache ECharts.

  You will receive entity data and write Python code to:
  1. Load the entity data (provided as JSON at DATA_FILE_PATH)
  2. Process, aggregate, or transform it as needed
  3. Output a JSON array suitable for Apache ECharts

  ECharts data format examples (array of objects):
  - Bar/Line: [{ "category": "A", "value": 100 }, { "category": "B", "value": 200 }]
  - Pie: [{ "name": "Slice 1", "value": 400 }]
  - Multi-series: [{ "month": "Jan", "sales": 100, "revenue": 200 }]

  Your Python code should print the final JSON array to stdout.
`);

type AnalysisToolName = "run_python" | "submit_result";

const analysisTools: LlmToolDefinition<AnalysisToolName>[] = [
  {
    name: "run_python",
    description:
      "Execute Python code. The code should print JSON to stdout. DATA_FILE_PATH contains the entity data.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Python code that processes data and prints JSON",
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_result",
    description: "Submit the final Python script once transformation is done.",
    inputSchema: {
      type: "object",
      properties: {
        pythonScript: {
          type: "string",
          description: "The final Python script",
        },
      },
      required: ["pythonScript"],
      additionalProperties: false,
    },
  },
];

// ============================================================================
// Step 3: Generate Chart Configuration
// ============================================================================

const chartConfigSystemPrompt = dedent(`
  You are an expert at data visualization. Generate configuration for Apache ECharts.

  Examples:
  - Bar: { "categoryKey": "name", "series": [{ "type": "bar", "dataKey": "value" }] }
  - Line: { "categoryKey": "month", "series": [{ "type": "line", "dataKey": "revenue", "smooth": true }] }
  - Pie: { "categoryKey": "name", "series": [{ "type": "pie", "dataKey": "value", "radius": "50%" }] }
  - Stacked bar: { "categoryKey": "cat", "series": [{ "type": "bar", "dataKey": "a", "stack": "total" }, { "type": "bar", "dataKey": "b", "stack": "total" }] }

  Additional options: xAxisLabel, yAxisLabel, showLegend, showGrid, showTooltip, colors
`);

type ChartConfigToolName = "submit_config";

const chartConfigTools: LlmToolDefinition<ChartConfigToolName>[] = [
  {
    name: "submit_config",
    description: "Submit the ECharts configuration",
    inputSchema: {
      type: "object",
      properties: {
        config: {
          type: "object",
          description: "The chart configuration object",
          properties: {
            categoryKey: { type: "string" },
            series: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["bar", "line", "pie", "scatter", "heatmap"],
                  },
                  name: { type: "string" },
                  dataKey: { type: "string" },
                  color: { type: "string" },
                  stack: { type: "string" },
                  smooth: { type: "boolean" },
                  radius: {},
                },
                required: ["type", "dataKey"],
              },
            },
            xAxisLabel: { type: "string" },
            yAxisLabel: { type: "string" },
            showLegend: { type: "boolean" },
            showGrid: { type: "boolean" },
            showTooltip: { type: "boolean" },
            colors: { type: "array", items: { type: "string" } },
          },
          required: ["categoryKey", "series"],
        },
      },
      required: ["config"],
      additionalProperties: false,
    },
  },
];

// ============================================================================
// Python Execution Helper
// ============================================================================

const runPythonCode = async (
  code: string,
  dataJson: string,
): Promise<{ stdout: string; stderr: string }> => {
  const sandbox = await CodeInterpreter.create();

  try {
    const requestId = Context.current().info.workflowExecution.workflowId;
    const dataFilePath = `/home/user/${requestId}_data.json`;
    await sandbox.filesystem.write(dataFilePath, dataJson);

    const codeWithDataPath = `DATA_FILE_PATH = "${dataFilePath}"\n${code}`;
    const response = await sandbox.runPython(codeWithDataPath);

    return {
      stdout: response.stdout,
      stderr: response.stderr,
    };
  } finally {
    await sandbox.close();
  }
};

// ============================================================================
// Main Activity
// ============================================================================

export const createDashboardConfigurationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  /**
   * Configure a dashboard item using LLM-based activities.
   * Updates the entity progressively at each step.
   */
  async configureDashboardItem(
    params: ConfigureDashboardItemParams,
  ): Promise<void> {
    const { authentication, itemEntityId, webId } = params;

    // Get the dashboard item entity
    const itemEntity = (await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    )) as HashEntity<DashboardItem>;

    const userGoal =
      itemEntity.properties["https://hash.ai/@h/types/property-type/goal/"];

    if (!userGoal) {
      throw new Error("Dashboard item is missing user goal");
    }

    // Update status to configuring
    await itemEntity.patch(graphApiClient, authentication, {
      propertyPatches: [
        {
          op: "replace",
          path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
          property: {
            value: "configuring",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      ],
      provenance: defaultProvenance,
    });

    // ========================================================================
    // Step 1: Generate Structural Query
    // ========================================================================

    logger.info(`[Dashboard Config] Generating query for: ${userGoal}`);

    // Fetch available entity types
    const { subgraph: typesSubgraph } = await queryEntityTypeSubgraph(
      graphApiClient,
      authentication,
      {
        filter: webId
          ? { equal: [{ path: ["webId"] }, { parameter: webId }] }
          : { all: [] },
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: almostFullOntologyResolveDepths,
        traversalPaths: [],
      },
    );

    type EntityTypeVertex = {
      kind: "entityType";
      inner: {
        schema: {
          title: string;
          $id: string;
          description?: string;
          properties?: Record<string, unknown>;
        };
      };
    };

    const entityTypes = Object.values(typesSubgraph.vertices)
      .flatMap((vertex) => Object.values(vertex))
      .filter(
        (vertex): vertex is EntityTypeVertex =>
          (vertex as { kind: string }).kind === "entityType",
      )
      .map((vertex) => ({
        title: vertex.inner.schema.title,
        $id: vertex.inner.schema.$id,
        description: vertex.inner.schema.description,
        properties: Object.keys(vertex.inner.schema.properties ?? {}),
      }));

    // LLM call to generate query
    type MessageType = Parameters<typeof getLlmResponse>[0]["messages"];

    let structuralQuery: Filter | null = null;
    let suggestedChartType: ChartType = "bar";

    const generateQuery = async (
      messages: MessageType,
      iteration: number,
    ): Promise<void> => {
      if (iteration > 6) {
        throw new Error("Exceeded maximum iterations for query generation");
      }

      const llmResponse = await getLlmResponse(
        {
          model,
          systemPrompt: queryGenerationSystemPrompt,
          messages,
          temperature: 0,
          seed: openAiSeed,
          tools: queryTools,
        },
        {
          customMetadata: { stepId: "dashboard-query", taskName: "generate" },
          userAccountId: authentication.actorId as UserId,
          graphApiClient,
          incurredInEntities: [{ entityId: itemEntityId }],
          webId,
        },
      );

      if (llmResponse.status !== "ok") {
        throw new Error(`LLM error: ${llmResponse.status}`);
      }

      const { message } = llmResponse;
      const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

      for (const toolCall of toolCalls) {
        const args = toolCall.input as Record<string, unknown>;

        if (toolCall.name === "get_entity_types") {
          return generateQuery(
            [
              ...messages,
              ...mapOpenAiMessagesToLlmMessages({
                messages: mapLlmMessageToOpenAiMessages({ message }),
              }),
              {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: toolCall.id,
                    content: `Available entity types:\n${stringify(entityTypes)}`,
                  },
                ],
              },
            ],
            iteration + 1,
          );
        }

        if (toolCall.name === "test_query") {
          const filter = args.filter as Filter;
          const limit = (args.limit as number | undefined) ?? 10;

          try {
            const { subgraph } = await queryEntitySubgraph(
              { graphApi: graphApiClient },
              authentication,
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

            const { entities: simpleEntities } = getSimpleGraph(subgraph);

            return generateQuery(
              [
                ...messages,
                ...mapOpenAiMessagesToLlmMessages({
                  messages: mapLlmMessageToOpenAiMessages({ message }),
                }),
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolCall.id,
                      content: `Query returned ${simpleEntities.length} entities:\n${stringify(simpleEntities.slice(0, limit))}`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          } catch (error) {
            return generateQuery(
              [
                ...messages,
                ...mapOpenAiMessagesToLlmMessages({
                  messages: mapLlmMessageToOpenAiMessages({ message }),
                }),
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolCall.id,
                      content: `Query error: ${error instanceof Error ? error.message : "Unknown"}`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          }
        }

        if (toolCall.name === "submit_query") {
          structuralQuery = args.filter as Filter;
          suggestedChartType = (args.suggestedChartType as ChartType) ?? "bar";
          return;
        }
      }

      // No tool calls - prompt to use one
      return generateQuery(
        [
          ...messages,
          ...mapOpenAiMessagesToLlmMessages({
            messages: mapLlmMessageToOpenAiMessages({ message }),
          }),
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please use one of the available tools.",
              },
            ],
          },
        ],
        iteration + 1,
      );
    };

    await generateQuery(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                User's visualization goal: "${userGoal}"
                Web ID: ${webId}

                Please:
                1. First get available entity types
                2. Construct and test a query
                3. Submit your final query
              `),
            },
          ],
        },
      ],
      1,
    );

    if (!structuralQuery) {
      throw new Error("Failed to generate structural query");
    }

    // Save query to entity
    let currentEntity = (await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    )) as HashEntity<DashboardItem>;

    await currentEntity.patch(graphApiClient, authentication, {
      propertyPatches: [
        {
          op: "add",
          path: [systemPropertyTypes.structuralQuery.propertyTypeBaseUrl],
          property: {
            value: structuralQuery,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        },
      ],
      provenance: defaultProvenance,
    });

    logger.info(`[Dashboard Config] Query saved, analyzing data...`);

    // ========================================================================
    // Step 2: Analyze Data & Generate Python Script
    // ========================================================================

    // Execute query to get data
    const { subgraph: dataSubgraph } = await queryEntitySubgraph(
      { graphApi: graphApiClient },
      authentication,
      {
        filter: structuralQuery,
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: almostFullOntologyResolveDepths,
        traversalPaths: [],
        includeDrafts: false,
        includePermissions: false,
      },
    );

    const { entities: simpleEntities, entityTypes: entityTypesForData } =
      getSimpleGraph(dataSubgraph);
    const entityDataJson = JSON.stringify({
      entities: simpleEntities,
      entityTypes: entityTypesForData,
    });

    let pythonScript: string | null = null;
    let chartData: unknown[] = [];

    const analyzeData = async (
      messages: MessageType,
      iteration: number,
    ): Promise<void> => {
      if (iteration > 6) {
        throw new Error("Exceeded maximum iterations for data analysis");
      }

      const llmResponse = await getLlmResponse(
        {
          model,
          systemPrompt: dataAnalysisSystemPrompt,
          messages,
          temperature: 0,
          seed: openAiSeed,
          tools: analysisTools,
        },
        {
          customMetadata: { stepId: "dashboard-analysis", taskName: "analyze" },
          userAccountId: authentication.actorId as UserId,
          graphApiClient,
          incurredInEntities: [{ entityId: itemEntityId }],
          webId,
        },
      );

      if (llmResponse.status !== "ok") {
        throw new Error(`LLM error: ${llmResponse.status}`);
      }

      const { message } = llmResponse;
      const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

      for (const toolCall of toolCalls) {
        const args = toolCall.input as Record<string, unknown>;

        if (toolCall.name === "run_python") {
          const code = args.code as string;

          try {
            const { stdout, stderr } = await runPythonCode(
              code,
              entityDataJson,
            );

            if (stderr) {
              return analyzeData(
                [
                  ...messages,
                  ...mapOpenAiMessagesToLlmMessages({
                    messages: mapLlmMessageToOpenAiMessages({ message }),
                  }),
                  {
                    role: "user",
                    content: [
                      {
                        type: "tool_result",
                        tool_use_id: toolCall.id,
                        content: `Error: ${stderr}\n\nPlease fix and try again.`,
                      },
                    ],
                  },
                ],
                iteration + 1,
              );
            }

            try {
              chartData = JSON.parse(stdout.trim()) as unknown[];
              pythonScript = code;

              return analyzeData(
                [
                  ...messages,
                  ...mapOpenAiMessagesToLlmMessages({
                    messages: mapLlmMessageToOpenAiMessages({ message }),
                  }),
                  {
                    role: "user",
                    content: [
                      {
                        type: "tool_result",
                        tool_use_id: toolCall.id,
                        content: dedent(`
                          Success! Output (first 5):
                          ${stringify(Array.isArray(chartData) ? chartData.slice(0, 5) : chartData)}

                          Total: ${Array.isArray(chartData) ? chartData.length : 1} items

                          If correct, submit your final script.
                        `),
                      },
                    ],
                  },
                ],
                iteration + 1,
              );
            } catch {
              return analyzeData(
                [
                  ...messages,
                  ...mapOpenAiMessagesToLlmMessages({
                    messages: mapLlmMessageToOpenAiMessages({ message }),
                  }),
                  {
                    role: "user",
                    content: [
                      {
                        type: "tool_result",
                        tool_use_id: toolCall.id,
                        content: `Output not valid JSON: ${stdout}\n\nPlease ensure code prints valid JSON.`,
                      },
                    ],
                  },
                ],
                iteration + 1,
              );
            }
          } catch (error) {
            return analyzeData(
              [
                ...messages,
                ...mapOpenAiMessagesToLlmMessages({
                  messages: mapLlmMessageToOpenAiMessages({ message }),
                }),
                {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: toolCall.id,
                      content: `Execution error: ${error instanceof Error ? error.message : "Unknown"}`,
                    },
                  ],
                },
              ],
              iteration + 1,
            );
          }
        }

        if (toolCall.name === "submit_result") {
          pythonScript = args.pythonScript as string;
          return;
        }
      }

      return analyzeData(
        [
          ...messages,
          ...mapOpenAiMessagesToLlmMessages({
            messages: mapLlmMessageToOpenAiMessages({ message }),
          }),
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please use run_python to transform data, or submit_result when done.",
              },
            ],
          },
        ],
        iteration + 1,
      );
    };

    await analyzeData(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                User's goal: "${userGoal}"
                Chart type: ${suggestedChartType}

                Entity data is at DATA_FILE_PATH. Sample:
                ${stringify(simpleEntities.slice(0, 3))}

                Entity types: ${stringify(entityTypesForData)}

                Write Python to load JSON from DATA_FILE_PATH, transform, and print JSON.
              `),
            },
          ],
        },
      ],
      1,
    );

    // Save Python script
    if (pythonScript) {
      currentEntity = (await getEntityById(
        graphApiClient,
        authentication,
        itemEntityId,
      )) as HashEntity<DashboardItem>;

      await currentEntity.patch(graphApiClient, authentication, {
        propertyPatches: [
          {
            op: "add",
            path: [systemPropertyTypes.pythonScript.propertyTypeBaseUrl],
            property: {
              value: pythonScript,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
          },
        ],
        provenance: defaultProvenance,
      });
    }

    logger.info(
      `[Dashboard Config] Python script saved, generating chart config...`,
    );

    // ========================================================================
    // Step 3: Generate Chart Configuration
    // ========================================================================

    let chartConfig: ChartConfig | null = null;

    const llmResponse = await getLlmResponse(
      {
        model,
        systemPrompt: chartConfigSystemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: dedent(`
                  User's goal: "${userGoal}"
                  Chart type: ${suggestedChartType}

                  Chart data (first 5):
                  ${stringify(Array.isArray(chartData) ? chartData.slice(0, 5) : chartData)}

                  Data keys: ${Array.isArray(chartData) && chartData.length > 0 && chartData[0] ? Object.keys(chartData[0] as object).join(", ") : "unknown"}

                  Generate an appropriate ECharts configuration.
                `),
              },
            ],
          },
        ],
        temperature: 0,
        seed: openAiSeed,
        tools: chartConfigTools,
      },
      {
        customMetadata: { stepId: "dashboard-chart", taskName: "config" },
        userAccountId: authentication.actorId as UserId,
        graphApiClient,
        incurredInEntities: [{ entityId: itemEntityId }],
        webId,
      },
    );

    if (llmResponse.status === "ok") {
      const { message } = llmResponse;
      const toolCalls = getToolCallsFromLlmAssistantMessage({ message });
      const submitCall = toolCalls.find((tc) => tc.name === "submit_config");

      if (submitCall) {
        const args = submitCall.input as { config: ChartConfig };
        chartConfig = args.config;
      }
    }

    // Default config if LLM didn't provide one
    if (!chartConfig) {
      const sampleItem =
        Array.isArray(chartData) && chartData.length > 0 ? chartData[0] : null;
      const keys = sampleItem
        ? Object.keys(sampleItem as object)
        : ["name", "value"];

      chartConfig = {
        categoryKey: keys[0] ?? "name",
        series: [
          {
            type: suggestedChartType,
            name: "Value",
            dataKey: keys[1] ?? "value",
          },
        ],
        showLegend: true,
        showGrid: true,
        showTooltip: true,
        colors: ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088fe"],
      };
    }

    // ========================================================================
    // Final: Save all config and set status to ready
    // ========================================================================

    currentEntity = (await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    )) as HashEntity<DashboardItem>;

    await currentEntity.patch(graphApiClient, authentication, {
      propertyPatches: [
        {
          op: "add",
          path: [systemPropertyTypes.chartType.propertyTypeBaseUrl],
          property: {
            value: suggestedChartType,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
        {
          op: "add",
          path: [systemPropertyTypes.chartConfiguration.propertyTypeBaseUrl],
          property: {
            value: chartConfig,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        } as PropertyPatchOperation,
        {
          op: "replace",
          path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
          property: {
            value: "ready",
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      ],
      provenance: defaultProvenance,
    });

    logger.info(
      `[Dashboard Config] Configuration complete for ${itemEntityId}`,
    );
  },

  /**
   * Update the status of a dashboard item.
   */
  async updateDashboardItemStatus(
    params: UpdateDashboardItemStatusParams,
  ): Promise<void> {
    const { authentication, itemEntityId, status, errorMessage } = params;

    const itemEntity = await getEntityById(
      graphApiClient,
      authentication,
      itemEntityId,
    );

    if (errorMessage) {
      logger.error(
        `Dashboard item ${itemEntityId} configuration failed: ${errorMessage}`,
      );
    }

    await itemEntity.patch(graphApiClient, authentication, {
      propertyPatches: [
        {
          op: "replace",
          path: [systemPropertyTypes.configurationStatus.propertyTypeBaseUrl],
          property: {
            value: status,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      ],
      provenance: defaultProvenance,
    });
  },
});
