import graphOpenApiSpec from "@rust/hash-graph-api/openapi.json" with { type: "json" };
import dedent from "dedent";

/**
 * Flow activity for generating a structural query based on a user's goal.
 * This activity explores available entity types, constructs and tests queries iteratively.
 */
import { extractBaseUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { stableStringify } from "@local/hash-backend-utils/dashboards";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import {
  getSimpleGraph,
  type SimpleEntityWithoutHref,
} from "@local/hash-backend-utils/simplified-graph";
import {
  queryEntitySubgraph,
  summarizeEntities,
} from "@local/hash-graph-sdk/entity";
import { queryEntityTypes } from "@local/hash-graph-sdk/entity-type";
import {
  type ChartType,
  chartTypes,
  type StructuralQueryDefinition,
} from "@local/hash-isomorphic-utils/dashboard-types";
import { getSimplifiedAiFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
  ignoreNoisySystemTypesFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { StatusCode } from "@local/status";

import { runAgenticToolLoop } from "../shared/agentic-tool-loop.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { scopeFilterToWeb } from "../shared/scope-filter-to-web.js";
import { stringify } from "../shared/stringify.js";

import type { PermittedAnthropicModel } from "../shared/get-llm-response/anthropic-client.js";
import type { LlmToolDefinition } from "../shared/get-llm-response/types.js";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import type { EntityTraversalPath, Filter } from "@local/hash-graph-client";
import type {
  AiActionStepOutput,
  InputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { JSONSchema } from "openai/lib/jsonschema";

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
 *
 * OpenAPI-specific keywords that JSON Schema validators reject in strict
 * mode (e.g. `discriminator` on EntityTraversalEdge) are dropped.
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
    if (key === "discriminator") {
      continue;
    }
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
  EntityTraversalPath: transformSchemaRefs(schemas.EntityTraversalPath!),
  EntityTraversalEdge: transformSchemaRefs(schemas.EntityTraversalEdge!),
  EdgeDirection: transformSchemaRefs(schemas.EdgeDirection!),
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
  links (link type, link properties, and target entity id). By default linked entities' own
  properties are NOT included — only their ids.

  ## Bringing in connected entities (traversalPaths)

  If the user's goal needs data that lives on a related entity (e.g. "deals grouped by the
  industry of their account"), pass "traversalPaths" alongside the filter. Each traversal path is
  a sequence of edges walked from every entity matching the filter; entities reached appear as
  additional top-level entities in the result. Joining works via "links" arrays, which sit on the
  SOURCE side of each link: for outgoing hops the roots' own "links" carry the targetEntityId of
  the connected entity; for incoming hops it is the connected entity's "links" that point at the
  root.

  Edges come in pairs, because links are themselves entities sitting between source and target:
  - One hop to the entities the roots LINK TO (outgoing):
    [{ "kind": "has-left-entity", "direction": "incoming" }, { "kind": "has-right-entity", "direction": "outgoing" }]
  - One hop to the entities that LINK TO the roots (incoming):
    [{ "kind": "has-right-entity", "direction": "incoming" }, { "kind": "has-left-entity", "direction": "outgoing" }]
  - Two hops outgoing = the outgoing pair repeated twice, and so on (max 10 edges per path,
    max 10 paths).

  Traversal is not filtered by link type: a hop brings in ALL entities linked at that hop. That
  is fine — the analysis script joins on the specific links it needs and ignores the rest. Keep
  traversal as shallow as the goal allows.

  If the goal only needs data on the matched entities themselves (or on their links' properties),
  do not use traversalPaths.

  ## Workflow (required)

  1. Pick the relevant entity types from the complete list provided in the first message.
  2. Construct a query, then use test_query to verify it returns the expected data. The EXACT
     query you submit (same filter and traversalPaths) must have been tested successfully —
     submit_query rejects untested queries, so re-test after any change before submitting.
  3. If the goal needs related-entity data, include traversalPaths in test_query and CHECK the
     results: the linked entities (and the specific properties the analysis needs) must actually
     appear before you submit. If they don't, adjust the traversal and re-test.
  4. Iterate until the results look correct, then use submit_query.

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

type ToolName = "test_query" | "submit_query";

type EntityTypeOverview = {
  title: string;
  baseUrl: string;
  count: number;
  description?: string;
  propertyBaseUrls: string[];
  outgoingLinks: {
    linkType: {
      title: string;
      baseUrl: string;
    };
    targetEntityTypes: {
      title: string;
      baseUrl: string;
    }[];
  }[];
};

const createEntityTypeOverview = ({
  entityTypes,
  entityTypeCounts,
}: {
  entityTypes: Awaited<ReturnType<typeof queryEntityTypes>>["entityTypes"];
  entityTypeCounts: NonNullable<
    Awaited<ReturnType<typeof summarizeEntities>>["typeIds"]
  >;
}): EntityTypeOverview[] => {
  const entityTypeById = new Map(
    entityTypes.map((entityType) => [entityType.schema.$id, entityType]),
  );
  const entityTypeByBaseUrl = new Map(
    entityTypes.map((entityType) => [
      extractBaseUrl(entityType.schema.$id),
      entityType,
    ]),
  );
  const getEntityTypeAndAncestors = (
    entityType: (typeof entityTypes)[number],
  ): (typeof entityTypes)[number][] => {
    const entityTypeAndAncestors: (typeof entityTypes)[number][] = [];
    const visitedEntityTypeIds = new Set<string>();

    const visitEntityType = (
      currentEntityType: (typeof entityTypes)[number],
    ) => {
      if (visitedEntityTypeIds.has(currentEntityType.schema.$id)) {
        return;
      }

      visitedEntityTypeIds.add(currentEntityType.schema.$id);
      entityTypeAndAncestors.push(currentEntityType);

      for (const parentReference of currentEntityType.schema.allOf ?? []) {
        const parentEntityType =
          entityTypeById.get(parentReference.$ref) ??
          entityTypeByBaseUrl.get(extractBaseUrl(parentReference.$ref));

        if (parentEntityType) {
          visitEntityType(parentEntityType);
        }
      }
    };

    visitEntityType(entityType);

    return entityTypeAndAncestors;
  };
  const countByBaseUrl = new Map<string, number>();

  for (const [entityTypeId, count] of typedEntries(entityTypeCounts)) {
    const baseUrl = extractBaseUrl(entityTypeId);
    countByBaseUrl.set(baseUrl, (countByBaseUrl.get(baseUrl) ?? 0) + count);
  }

  const overviewByBaseUrl = new Map<string, EntityTypeOverview>();

  for (const entityType of entityTypes) {
    const baseUrl = extractBaseUrl(entityType.schema.$id);
    const versionCount = entityTypeCounts[entityType.schema.$id] ?? 0;
    const count = countByBaseUrl.get(baseUrl) ?? 0;

    /**
     * An ontology type with no instances in this web cannot contribute data to
     * the chart. Omitting it also prevents the model from spending iterations
     * probing plausible-but-empty types. Check the version-specific count here
     * so properties and links from unused historical versions are not merged
     * into the overview for a populated version.
     */
    if (versionCount === 0) {
      continue;
    }

    const entityTypeAndAncestors = getEntityTypeAndAncestors(entityType);
    if (
      entityTypeAndAncestors.some(
        (ancestorEntityType) =>
          ancestorEntityType.schema.$id ===
          blockProtocolEntityTypes.link.entityTypeId,
      )
    ) {
      continue;
    }

    const existingOverview = overviewByBaseUrl.get(baseUrl);
    const propertyBaseUrls = new Set([
      ...(existingOverview?.propertyBaseUrls ?? []),
      ...entityTypeAndAncestors.flatMap((ancestorEntityType) =>
        Object.keys(ancestorEntityType.schema.properties),
      ),
    ]);
    const outgoingLinksByBaseUrl = new Map(
      (existingOverview?.outgoingLinks ?? []).map((outgoingLink) => [
        outgoingLink.linkType.baseUrl,
        outgoingLink,
      ]),
    );

    for (const ancestorEntityType of entityTypeAndAncestors) {
      for (const [linkTypeId, linkSchema] of typedEntries(
        ancestorEntityType.schema.links ?? {},
      )) {
        const linkTypeBaseUrl = extractBaseUrl(linkTypeId);
        const linkType = entityTypeById.get(linkTypeId);
        const existingOutgoingLink =
          outgoingLinksByBaseUrl.get(linkTypeBaseUrl);
        const targetEntityTypesByBaseUrl = new Map(
          (existingOutgoingLink?.targetEntityTypes ?? []).map(
            (targetEntityType) => [targetEntityType.baseUrl, targetEntityType],
          ),
        );

        if ("oneOf" in linkSchema.items) {
          for (const targetSchema of linkSchema.items.oneOf) {
            const targetEntityTypeBaseUrl = extractBaseUrl(targetSchema.$ref);
            const targetEntityType =
              entityTypeById.get(targetSchema.$ref) ??
              entityTypeByBaseUrl.get(targetEntityTypeBaseUrl);

            targetEntityTypesByBaseUrl.set(targetEntityTypeBaseUrl, {
              title: targetEntityType?.schema.title ?? targetEntityTypeBaseUrl,
              baseUrl: targetEntityTypeBaseUrl,
            });
          }
        }

        outgoingLinksByBaseUrl.set(linkTypeBaseUrl, {
          linkType: {
            title: linkType?.schema.title ?? linkTypeBaseUrl,
            baseUrl: linkTypeBaseUrl,
          },
          targetEntityTypes: [...targetEntityTypesByBaseUrl.values()].sort(
            (left, right) => left.title.localeCompare(right.title),
          ),
        });
      }
    }

    overviewByBaseUrl.set(baseUrl, {
      title: entityType.schema.title,
      baseUrl,
      count,
      description: entityType.schema.description,
      propertyBaseUrls: [...propertyBaseUrls].sort(),
      outgoingLinks: [...outgoingLinksByBaseUrl.values()].sort((left, right) =>
        left.linkType.title.localeCompare(right.linkType.title),
      ),
    });
  }

  return [...overviewByBaseUrl.values()].sort((left, right) =>
    left.title.localeCompare(right.title),
  );
};

const compactExampleValue = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  const serializedValue =
    typeof value === "string" ? value : JSON.stringify(value);

  return serializedValue.length > 120
    ? `${serializedValue.slice(0, 117)}...`
    : serializedValue;
};

const createTestQuerySummary = (simpleEntities: SimpleEntityWithoutHref[]) => {
  const entityById = new Map<string, SimpleEntityWithoutHref>(
    simpleEntities.map((entity) => [entity.entityId, entity]),
  );
  type EntityTypeSummary = {
    count: number;
    properties: Map<
      string,
      {
        presentOn: number;
        example: unknown;
      }
    >;
  };
  const entityTypes = new Map<string, EntityTypeSummary>();
  const links = new Map<
    string,
    {
      sourceEntityTypes: string[];
      linkEntityTypes: string[];
      targetEntityTypes: string[];
      count: number;
    }
  >();

  for (const entity of simpleEntities) {
    for (const entityType of entity.entityTypes) {
      const entityTypeSummary: EntityTypeSummary = entityTypes.get(
        entityType,
      ) ?? {
        count: 0,
        properties: new Map(),
      };
      entityTypeSummary.count += 1;

      for (const [propertyName, propertyValue] of Object.entries(
        entity.properties,
      )) {
        const propertySummary = entityTypeSummary.properties.get(
          propertyName,
        ) ?? {
          presentOn: 0,
          example: compactExampleValue(propertyValue),
        };
        propertySummary.presentOn += 1;
        entityTypeSummary.properties.set(propertyName, propertySummary);
      }

      entityTypes.set(entityType, entityTypeSummary);
    }

    for (const link of entity.links) {
      const targetEntity = entityById.get(link.targetEntityId);
      const sourceEntityTypes = [...entity.entityTypes].sort();
      const linkEntityTypes = [...link.entityTypes].sort();
      const targetEntityTypes = targetEntity
        ? [...targetEntity.entityTypes].sort()
        : ["not included in query result"];
      const linkKey = stableStringify({
        sourceEntityTypes,
        linkEntityTypes,
        targetEntityTypes,
      });
      const linkSummary = links.get(linkKey) ?? {
        sourceEntityTypes,
        linkEntityTypes,
        targetEntityTypes,
        count: 0,
      };
      linkSummary.count += 1;
      links.set(linkKey, linkSummary);
    }
  }

  return {
    entityCount: simpleEntities.length,
    entityTypes: [...entityTypes.entries()]
      .map(([title, entityTypeSummary]) => ({
        title,
        count: entityTypeSummary.count,
        properties: [...entityTypeSummary.properties.entries()]
          .map(([name, propertySummary]) => ({
            name,
            ...propertySummary,
          }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.title.localeCompare(right.title)),
    linkTopology: [...links.values()].sort((left, right) =>
      stableStringify(left).localeCompare(stableStringify(right)),
    ),
  };
};

/**
 * `LlmToolInputSchema` property values don't admit `$ref` inside `items`, but
 * the runtime validator resolves them against `$defs` fine — hence the cast.
 */
const traversalPathArraySchema = {
  $ref: "#/$defs/EntityTraversalPath",
} as unknown as JSONSchema;

/**
 * The model sometimes provides the `filter` / `traversalPaths` arguments as
 * JSON-encoded strings rather than objects — parse them before schema
 * validation so the request doesn't get stuck in a validation-retry loop.
 */
const parseStringifiedFilter = (rawInput: object): object => {
  const result: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
  };
  for (const key of ["filter", "traversalPaths"]) {
    if (typeof result[key] === "string") {
      result[key] = JSON.parse(result[key]) as unknown;
    }
  }
  return result;
};

const tools: LlmToolDefinition<ToolName>[] = [
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
        traversalPaths: {
          type: "array",
          items: traversalPathArraySchema,
          description:
            "Optional traversal paths walked from each matched entity to pull connected entities into the results (see system prompt for the edge-pair encoding)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 100)",
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
      "Submit the final query once you're satisfied it returns the correct data for the user's goal. The exact filter and traversalPaths submitted must previously have been run successfully via test_query.",
    sanitizeInputBeforeValidation: parseStringifiedFilter,
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          $ref: "#/$defs/Filter",
          description: "The final filter object for the structural query",
        },
        traversalPaths: {
          type: "array",
          items: traversalPathArraySchema,
          description:
            "Optional traversal paths walked from each matched entity to pull connected entities into the results. Include these if (and only if) the analysis needs data on related entities, and only after verifying via test_query that the needed data appears.",
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
            enum: [...chartTypes],
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
 * calls). A typical successful run uses a few test queries followed by submit,
 * but exploratory goals can need more.
 */
const maximumIterations = 20;

type ActionOutputs = AiActionStepOutput<"generateStructuralQuery">[];

export const generateStructuralQueryAction: AiFlowActionActivity<
  "generateStructuralQuery"
> = async ({ inputs }) => {
  const {
    userGoal,
    refinementInstruction,
    existingStructuralQuery,
    existingChartType,
    refinementScope,
  } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "generateStructuralQuery",
  }) as {
    [K in InputNameForAiFlowAction<"generateStructuralQuery">]:
      | string
      | undefined;
  };

  const { userAuthentication, stepId, flowEntityId, webId } =
    await getFlowContext();

  if (refinementScope && refinementScope !== "query") {
    if (!existingStructuralQuery || !existingChartType) {
      return {
        code: StatusCode.InvalidArgument,
        message: "Existing query and chart type are required for refinement",
        contents: [],
      };
    }

    const outputs: ActionOutputs = [
      {
        outputName: "structuralQuery",
        payload: { kind: "Text", value: existingStructuralQuery },
      },
      {
        outputName: "explanation",
        payload: {
          kind: "Text",
          value: "Existing structural query preserved by refinement plan",
        },
      },
      {
        outputName: "suggestedChartTypes",
        payload: {
          kind: "Text",
          value: JSON.stringify([existingChartType]),
        },
      },
    ];
    return {
      code: StatusCode.Ok,
      message: "Existing structural query preserved",
      contents: [{ outputs }],
    };
  }

  if (!userGoal) {
    return {
      code: StatusCode.InvalidArgument,
      message: "userGoal is required",
      contents: [],
    };
  }

  const webMachineId = await getWebMachineId(
    { graphApi: graphApiClient },
    userAuthentication,
    { webId },
  );
  if (!webMachineId) {
    throw new Error(`Could not find the web machine for web "${webId}"`);
  }
  const webMachineAuthentication = { actorId: webMachineId };

  const [entityTypesResponse, entitySummary] = await Promise.all([
    queryEntityTypes(graphApiClient, userAuthentication, {
      filter: { all: [] },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeEntityTypes: "resolved",
    }),
    summarizeEntities({ graphApi: graphApiClient }, webMachineAuthentication, {
      filter: scopeFilterToWeb(ignoreNoisySystemTypesFilter, webId),
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includeTypeIds: true,
    }),
  ]);

  /**
   * Only populated types are useful for constructing a query in this web.
   * Counts and declared link topology let the model select viable types
   * without first reverse-engineering the graph through test queries.
   */
  const entityTypeOverview = createEntityTypeOverview({
    entityTypes: entityTypesResponse.entityTypes,
    entityTypeCounts: entitySummary.typeIds ?? {},
  });

  /**
   * Canonical keys of the (filter, traversalPaths) combinations that a
   * test_query has executed without error.
   * submit_query is only accepted for a combination in this set, so the
   * submitted query is guaranteed to have been verified as-is.
   */
  const testedQueryKeys = new Set<string>();

  const queryKey = (filter: Filter, traversalPaths: EntityTraversalPath[]) =>
    stableStringify({ filter, traversalPaths });

  type LoopResult = {
    structuralQuery: StructuralQueryDefinition;
    suggestedChartTypes: ChartType[];
    explanation: string;
  };

  try {
    const response = await runAgenticToolLoop<ToolName, LoopResult>({
      model,
      systemPrompt,
      tools,
      maximumIterations,
      noToolCallNudge:
        "Please use test_query to verify a query or submit_query to submit the verified final query.",
      usageTrackingParams: {
        customMetadata: {
          stepId,
          taskName: "generate-structural-query",
        },
        userAccountId: userAuthentication.actorId,
        graphApiClient,
        incurredInEntities: [{ entityId: flowEntityId }],
        webId,
      },
      onIterationLimit: () => {
        throw new Error(
          `Exceeded maximum iterations (${maximumIterations}) for query generation`,
        );
      },
      initialMessages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                User's goal: "${userGoal}"
                ${
                  refinementInstruction && existingStructuralQuery
                    ? dedent(`
                        Refinement instruction: "${refinementInstruction}"
                        Existing structural query:
                        ${existingStructuralQuery}

                        Refine the existing query only as required by the instruction.
                      `)
                    : ""
                }

                These are the ${entityTypeOverview.length} populated entity types in the selected web.
                Each entry includes its entity count and declared outgoing link topology. Pick relevant types only from this list:
                ${JSON.stringify(entityTypeOverview)}

                Please:
                1. Pick the relevant types and property base URLs from the list above
                2. Construct a query and test it with test_query to verify it returns appropriate data
                3. Submit your final query when satisfied (the exact query must have been tested successfully first)
              `),
            },
          ],
        },
      ],
      handleToolCall: async (toolCall) => {
        const args = toolCall.input as Record<string, unknown>;

        switch (toolCall.name) {
          case "test_query": {
            const filter = args.filter as Filter;
            const traversalPaths = (args.traversalPaths ??
              []) as EntityTraversalPath[];
            const limit = (args.limit as number | undefined) ?? 100;

            try {
              const { subgraph } = await queryEntitySubgraph(
                { graphApi: graphApiClient },
                webMachineAuthentication,
                {
                  filter: scopeFilterToWeb(filter, webId),
                  temporalAxes: currentTimeInstantTemporalAxes,
                  graphResolveDepths: almostFullOntologyResolveDepths,
                  traversalPaths,
                  includeDrafts: false,
                  limit,
                  includePermissions: false,
                },
              );

              const { entities: simpleEntities } = getSimpleGraph(subgraph);

              const querySummary = createTestQuerySummary(simpleEntities);

              testedQueryKeys.add(queryKey(filter, traversalPaths));

              return {
                kind: "tool-result",
                content: stringify(querySummary),
              };
            } catch (error) {
              return {
                kind: "tool-result",
                content: `Query error: ${error instanceof Error ? error.message : "Unknown error"}`,
              };
            }
          }

          case "submit_query": {
            const filter = args.filter as Filter;
            const traversalPaths = (args.traversalPaths ??
              []) as EntityTraversalPath[];

            if (!testedQueryKeys.has(queryKey(filter, traversalPaths))) {
              return {
                kind: "tool-result",
                content:
                  "Rejected: this exact query (filter and traversalPaths) has not been successfully tested. Run test_query with it, confirm the results contain the data the goal needs, then submit it unchanged.",
              };
            }

            return {
              kind: "complete",
              result: {
                structuralQuery: { filter, traversalPaths },
                suggestedChartTypes: args.suggestedChartTypes as ChartType[],
                explanation: args.explanation as string,
              },
            };
          }
        }
      },
    });

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
