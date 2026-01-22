import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import type { Filter } from "@local/hash-graph-client";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import { queryEntityTypeSubgraph } from "@local/hash-graph-sdk/entity-type";
import type { ChartType } from "@local/hash-isomorphic-utils/dashboard-types";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";
import dedent from "dedent";

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

type ToolName = "get_entity_types" | "test_query" | "submit_query";

const tools: LlmToolDefinition<ToolName>[] = [
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
            enum: [
              "bar",
              "line",
              "area",
              "pie",
              "scatter",
              "radar",
              "composed",
            ],
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

type ActionOutputs = AiActionStepOutput<"generateDashboardQuery">[];

export const generateDashboardQueryAction: AiFlowActionActivity<
  "generateDashboardQuery"
> = async ({ inputs }) => {
  const { userGoal } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "generateDashboardQuery",
  }) as {
    [K in InputNameForAiFlowAction<"generateDashboardQuery">]: string;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  type MessageType = Parameters<typeof getLlmResponse>[0]["messages"];

  const callModel = async (
    messages: MessageType,
    iteration: number,
  ): Promise<ReturnType<AiFlowActionActivity<"generateDashboardQuery">>> => {
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
            graphApiClient,
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
          type EntityTypeVertex = {
            kind: "entityType";
            inner: {
              schema: {
                title: string;
                description?: string;
                properties?: Record<string, unknown>;
              };
            };
          };

          const entityTypes = Object.values(subgraph.vertices)
            .flatMap((vertex) => Object.values(vertex))
            .filter(
              (vertex): vertex is EntityTypeVertex =>
                (vertex as { kind: string }).kind === "entityType",
            )
            .map((vertex) => ({
              title: vertex.inner.schema.title,
              description: vertex.inner.schema.description,
              properties: Object.keys(vertex.inner.schema.properties ?? {}),
            }));

          return callModel(
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

        case "test_query": {
          const filter = args.filter as Filter;
          const limit = (args.limit as number | undefined) ?? 10;

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

            const { entities: simpleEntities } = getSimpleGraph(subgraph);

            return callModel(
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
            return callModel(
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
                      content: `Query error: ${error instanceof Error ? error.message : "Unknown error"}`,
                    },
                  ],
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

          const outputs: ActionOutputs = [
            {
              outputName: "structuredQuery",
              payload: {
                kind: "Text",
                value: JSON.stringify(filter),
              },
            },
            {
              outputName: "explanation",
              payload: {
                kind: "Text",
                value: explanation,
              },
            },
            {
              outputName: "suggestedChartTypes",
              payload: {
                kind: "Text",
                value: JSON.stringify(suggestedChartTypes),
              },
            },
          ];

          return {
            code: StatusCode.Ok,
            message: "Query generated successfully",
            contents: [{ outputs }],
          };
        }

        default: {
          return callModel(
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
                    text: `Unknown tool: ${toolCall.name}. Please use one of the available tools.`,
                  },
                ],
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
        ...mapOpenAiMessagesToLlmMessages({
          messages: mapLlmMessageToOpenAiMessages({ message }),
        }),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please use one of the available tools to explore entity types, test a query, or submit your final query.",
            },
          ],
        },
      ],
      iteration + 1,
    );
  };

  return callModel(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: dedent(`
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
      },
    ],
    1,
  );
};
