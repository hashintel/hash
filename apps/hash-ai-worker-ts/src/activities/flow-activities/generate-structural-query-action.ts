import graphOpenApiSpec from "@rust/hash-graph-api/openapi.json" with { type: "json" };
import dedent from "dedent";

/**
 * Flow activity for generating a structural query based on a user's goal.
 * This activity explores available entity types, constructs and tests queries iteratively.
 */
import { extractBaseUrl } from "@blockprotocol/type-system";
import { getSimpleGraph } from "@local/hash-backend-utils/simplified-graph";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import {
  queryEntityTypes,
  searchEntityTypes,
} from "@local/hash-graph-sdk/entity-type";
import {
  type ChartType,
  chartTypes,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getLlmResponse } from "../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { stringify } from "../shared/stringify.js";

import type { PermittedAnthropicModel } from "../shared/get-llm-response/anthropic-client.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { Filter } from "@local/hash-graph-client";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";

/**
 * Generic JSON value type for schema definitions.
 * This is more permissive than JSONSchema to avoid type conflicts with imported JSON.
 */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const model: PermittedAnthropicModel = "claude-opus-4-8";

/**
 * Extracts and transforms a schema from the OpenAPI spec for use as a $def.
 * Converts all $ref paths from #/components/schemas/X to #/$defs/X.
 *
 * Also relaxes `oneOf` to `anyOf`: the Filter schema's path tokens are
 * overlapping enums (e.g. "baseUrl" is a valid token of several query-token
 * types), so valid filters routinely match more than one `oneOf` branch and
 * would be rejected by strict validation. The schema is guidance for the
 * model — ground truth is the graph API itself via test_query.
 */
const transformSchemaRefs = (schema: JsonValue): JsonValue => {
  if (schema === null || typeof schema !== "object") {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(transformSchemaRefs);
  }

  const result: { [key: string]: JsonValue } = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$ref" && typeof value === "string") {
      result[key] = value.replace("#/components/schemas/", "#/$defs/");
    } else if (key === "oneOf") {
      result.anyOf = transformSchemaRefs(value);
    } else {
      result[key] = transformSchemaRefs(value);
    }
  }
  return result;
};

/**
 * Schema definitions extracted from the Graph API OpenAPI spec.
 * These are used to validate the filter structure in AI tool calls.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- JSON import has known structure
const schemas = graphOpenApiSpec.components.schemas as unknown as Record<
  string,
  JsonValue
>;

const filterSchemaDefinitions = {
  Filter: transformSchemaRefs(schemas.Filter!),
  FilterExpression: transformSchemaRefs(schemas.FilterExpression!),
  PathExpression: transformSchemaRefs(schemas.PathExpression!),
  ParameterExpression: transformSchemaRefs(schemas.ParameterExpression!),
  DataTypeQueryToken: transformSchemaRefs(schemas.DataTypeQueryToken!),
  PropertyTypeQueryToken: transformSchemaRefs(schemas.PropertyTypeQueryToken!),
  EntityTypeQueryToken: transformSchemaRefs(schemas.EntityTypeQueryToken!),
  EntityQueryToken: transformSchemaRefs(schemas.EntityQueryToken!),
  Selector: transformSchemaRefs(schemas.Selector!),
  VersionedUrl: transformSchemaRefs(schemas.VersionedUrl!),
};

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

  ## Important: what the query returns

  The query returns the entities matching the filter, each with its properties and its outgoing
  links (link type, link properties, and target entity id). It does NOT return the full data of
  linked entities — link traversal is not performed. If the user's goal needs data that lives on a
  related entity (e.g. "deals grouped by the name of their account"), prefer instead:
  - properties stored directly on the matched entities, or
  - properties stored on the link itself, or
  - filtering the matched type via ["leftEntity", ...] / ["rightEntity", ...] paths (for link
    entities) so the returned entities carry the needed data themselves.
  Pick the entity type whose instances carry the values to be charted.

  ## Workflow (required)

  1. Use search_entity_types to find the entity types relevant to the user's goal (the initial
     list you are given may be incomplete).
  2. Construct a query, then use test_query to verify it returns the expected data. You MUST run
     at least one successful test_query before submitting — submit_query will be rejected
     otherwise.
  3. Iterate until the results look correct, then use submit_query.

  When suggesting chart types, strongly prefer bar and line charts — only include pie if the
  user's goal explicitly asks for one.

  ## Examples

  These examples may not use real types / paths – rely on the entity types you discover instead!

  1. Get all people named "John Doe"

  {
    all: [
      {
        equal: [{ path: ["properties", "https://hash.ai/@h/types/property-type/name/"] }, { parameter: "John Doe" }],
      },
      {
        equal: [{ path: ["type", "baseUrl"] }, { parameter: "https://hash.ai/@h/types/entity-type/person/" }],
      },
    ],
  }

  2. Get all Products

  {
    all: [
      {
        equal: [{ path: ["type", "baseUrl"] }, { parameter: "https://hash.ai/@h/types/entity-type/product/" }],
      },
    ],
  }
`);

type ToolName = "search_entity_types" | "test_query" | "submit_query";

/**
 * The model sometimes provides the `filter` argument as a JSON-encoded string
 * rather than an object — parse it before schema validation so the request
 * doesn't get stuck in a validation-retry loop.
 */
const parseStringifiedFilter = (rawInput: object): object => {
  if (
    "filter" in rawInput &&
    typeof (rawInput as { filter: unknown }).filter === "string"
  ) {
    return {
      ...rawInput,
      filter: JSON.parse((rawInput as { filter: string }).filter) as unknown,
    };
  }
  return rawInput;
};

const tools: LlmToolDefinition<ToolName>[] = [
  {
    name: "search_entity_types",
    description:
      "Semantically search the available entity types by a natural-language phrase. Returns matching types with their property base URLs, which you need for building 'properties' filter paths.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A short natural-language description of the kind of entity to find, e.g. 'sales deals' or 'aircraft flights'",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "test_query",
    description:
      "Execute a structural query and see the results. Use this to validate your query returns the expected data.",
    sanitizeInputBeforeValidation: parseStringifiedFilter,
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          $ref: "#/$defs/Filter",
          description: "The filter object for the structural query",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 10)",
        },
      },
      required: ["filter"],
      additionalProperties: false,
      $defs: filterSchemaDefinitions as Record<string, unknown>,
    },
  },
  {
    name: "submit_query",
    description:
      "Submit the final query once you're satisfied it returns the correct data for the user's goal.",
    sanitizeInputBeforeValidation: parseStringifiedFilter,
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          $ref: "#/$defs/Filter",
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
            enum: chartTypes,
          },
          description:
            "Suggested chart types that would work well with this data, in order of preference. Strongly prefer bar and line charts; only suggest pie if the user explicitly asked for one.",
        },
      },
      required: ["filter", "explanation", "suggestedChartTypes"],
      additionalProperties: false,
      $defs: filterSchemaDefinitions as Record<string, unknown>,
    },
  },
];

/**
 * Each iteration is one model turn (which may include several parallel tool
 * calls). A typical successful run uses ~6–10 turns (type search, a few
 * test queries, submit), but exploratory goals can need more.
 */
const maximumIterations = 20;

/**
 * Cap how many entity types are listed in the opening message. The model can
 * find anything not listed via the search_entity_types tool.
 */
const maximumInitialEntityTypes = 50;

/**
 * Cap the size of test_query result payloads fed back to the model, so a
 * broad test query can't blow up the context window.
 */
const maximumTestResultCharacters = 20_000;

/** Maximum semantic distance for entity type search results (see search-bar). */
const maximumSemanticDistance = 0.7;

type ActionOutputs = AiActionStepOutput<"generateStructuralQuery">[];

export const generateStructuralQueryAction: AiFlowActionActivity<
  "generateStructuralQuery"
> = async ({ inputs }) => {
  const { userGoal } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "generateStructuralQuery",
  }) as {
    [K in InputNameForAiFlowAction<"generateStructuralQuery">]: string;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  const entityTypesResponse = await queryEntityTypes(
    graphApiClient,
    userAuthentication,
    {
      filter: { all: [] },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeEntityTypes: "resolved",
    },
  );

  /**
   * A compact overview of (a capped number of) available entity types for the
   * opening message. Property base URLs are deliberately omitted here – the
   * model retrieves them for the types it cares about via search_entity_types.
   */
  const entityTypeOverview = entityTypesResponse.entityTypes
    .slice(0, maximumInitialEntityTypes)
    .map((entityType) => ({
      title: entityType.schema.title,
      baseUrl: extractBaseUrl(entityType.schema.$id),
      description: entityType.schema.description,
    }));

  const totalEntityTypeCount = entityTypesResponse.entityTypes.length;

  const simplifyEntityTypeForSearchResult = (
    entityType: (typeof entityTypesResponse.entityTypes)[number],
  ) => ({
    title: entityType.schema.title,
    baseUrl: extractBaseUrl(entityType.schema.$id),
    description: entityType.schema.description,
    propertyBaseUrls: Object.keys(entityType.schema.properties),
  });

  const handleSearchEntityTypes = async (query: string): Promise<string> => {
    try {
      const { entityTypes: matches } = await searchEntityTypes(
        { graphApi: graphApiClient },
        userAuthentication,
        {
          semanticString: query,
          maximumSemanticDistance,
          limit: 10,
        },
      );

      if (matches.length > 0) {
        return `Matching entity types:\n${stringify(
          matches.map(simplifyEntityTypeForSearchResult),
        )}`;
      }
    } catch {
      // Semantic search unavailable (e.g. embeddings not generated) – fall
      // through to the keyword match below.
    }

    const lowerCaseQuery = query.toLowerCase();
    const keywordMatches = entityTypesResponse.entityTypes
      .filter(
        ({ schema }) =>
          schema.title.toLowerCase().includes(lowerCaseQuery) ||
          schema.description.toLowerCase().includes(lowerCaseQuery),
      )
      .slice(0, 10);

    if (keywordMatches.length === 0) {
      return "No matching entity types found. Try a different search phrase, or pick from the entity types listed in the first message.";
    }

    return `Matching entity types:\n${stringify(
      keywordMatches.map(simplifyEntityTypeForSearchResult),
    )}`;
  };

  type MessageType = Parameters<typeof getLlmResponse>[0]["messages"];

  type QueryGenerationState = {
    /** Whether a test_query has returned at least one entity. */
    hasSuccessfulTest: boolean;
  };

  const callModel = async (
    messages: MessageType,
    iteration: number,
    state: QueryGenerationState,
  ): Promise<{
    structuralQuery: Filter;
    suggestedChartTypes: ChartType[];
    explanation: string;
  }> => {
    if (iteration > maximumIterations) {
      throw new Error(
        `Exceeded maximum iterations (${maximumIterations}) for query generation`,
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
          taskName: "generate-structural-query",
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

    /**
     * The model may make multiple tool calls in a single message. Every
     * tool_use block must receive a matching tool_result in the next user
     * message, otherwise the Anthropic API rejects the conversation.
     */
    const toolResults: { tool_use_id: string; content: string }[] = [];
    const currentState: QueryGenerationState = { ...state };

    for (const toolCall of toolCalls) {
      const args = toolCall.input as Record<string, unknown>;

      switch (toolCall.name) {
        case "search_entity_types": {
          const query = args.query as string;

          toolResults.push({
            tool_use_id: toolCall.id,
            content: await handleSearchEntityTypes(query),
          });
          break;
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

            let resultsJson = stringify(simpleEntities.slice(0, limit));
            if (resultsJson.length > maximumTestResultCharacters) {
              resultsJson = `${resultsJson.slice(
                0,
                maximumTestResultCharacters,
              )}\n… (results truncated – rely on the entities shown above)`;
            }

            currentState.hasSuccessfulTest =
              currentState.hasSuccessfulTest || simpleEntities.length > 0;

            toolResults.push({
              tool_use_id: toolCall.id,
              content: `Query returned ${simpleEntities.length} entities:\n${resultsJson}`,
            });
          } catch (error) {
            toolResults.push({
              tool_use_id: toolCall.id,
              content: `Query error: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
          }
          break;
        }

        case "submit_query": {
          if (!currentState.hasSuccessfulTest) {
            toolResults.push({
              tool_use_id: toolCall.id,
              content:
                "Rejected: you must run test_query and see it return at least one entity before submitting. Test your query first.",
            });
            break;
          }

          const structuralQuery = args.filter as Filter;
          const suggestedChartTypes = args.suggestedChartTypes as ChartType[];
          const explanation = args.explanation as string;

          return { structuralQuery, suggestedChartTypes, explanation };
        }
      }
    }

    if (toolResults.length > 0) {
      return callModel(
        [
          ...messages,
          message,
          {
            role: "user",
            content: toolResults.map(({ tool_use_id, content }) => ({
              type: "tool_result" as const,
              tool_use_id,
              content,
            })),
          },
        ],
        iteration + 1,
        currentState,
      );
    }

    // No tool calls - prompt to use a tool
    return callModel(
      [
        ...messages,
        message,
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
      state,
    );
  };

  try {
    const response = await callModel(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                User's goal: "${userGoal}"

                There are ${totalEntityTypeCount} entity types available. Here is an overview of ${entityTypeOverview.length} of them (use search_entity_types to find others, and to get the property base URLs of any type you want to filter on):
                ${JSON.stringify(entityTypeOverview)}

                Please:
                1. Use search_entity_types to find the types relevant to the goal
                2. Construct a query and test it with test_query to verify it returns appropriate data
                3. Submit your final query when satisfied (a successful test is required first)
              `),
            },
          ],
        },
      ],
      1,
      { hasSuccessfulTest: false },
    );

    const { structuralQuery, suggestedChartTypes, explanation } = response;

    const outputs: ActionOutputs = [
      {
        outputName: "structuralQuery",
        payload: {
          kind: "Text",
          value: JSON.stringify(structuralQuery),
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
  } catch (error) {
    return {
      code: StatusCode.Internal,
      message: error instanceof Error ? error.message : "Unknown error",
      contents: [],
    };
  }
};
