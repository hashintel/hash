import { useApolloClient } from "@apollo/client";
import { useMemo } from "react";
import * as z from "zod";

import { getEntities, getRoots } from "@blockprotocol/graph/stdlib";
import {
  type EntityId,
  extractDraftIdFromEntityId,
  extractWebIdFromEntityId,
  splitEntityId,
} from "@blockprotocol/type-system";
import { brunchTools } from "@hashintel/brunch-agent";
import {
  deserializeQueryEntitySubgraphResponse,
  type QueryEntitySubgraphRequest,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { PetrinautAiAutomaticTool } from "@hashintel/brunch-agent/ui";
import type { Filter } from "@local/hash-graph-client";

/**
 * The input Brunch's HASH agent issues for its entity read. The agent's
 * schema is the authority and has already validated it; this only narrows it.
 */
const hashEntityReadInputSchema = z.object({
  entityTypes: z.array(z.string()).optional(),
  webIds: z.array(z.string()).optional(),
  entityIds: z.array(z.string()).optional(),
  traversalDepth: z.number().optional(),
  includeDrafts: z.boolean().optional(),
});

export type HashEntityReadInput = z.infer<typeof hashEntityReadInputSchema>;

const defaultTraversalDepth = 1;
const maxTraversalDepth = 5;

const isTypeUrl = (type: string) =>
  type.startsWith("http://") || type.startsWith("https://");

const anyOf = (filters: Filter[]): Filter[] =>
  filters.length === 0 ? [] : [{ any: filters }];

/** Link traversals out to `depth` links from the matched entities, in either direction. */
const traversalPathsTo = (depth: number) =>
  depth === 0
    ? []
    : [
        {
          edges: Array.from({ length: depth }, () => [
            { kind: "has-left-entity", direction: "incoming" } as const,
            { kind: "has-right-entity", direction: "outgoing" } as const,
          ]).flat(),
        },
        {
          edges: Array.from({ length: depth }, () => [
            { kind: "has-right-entity", direction: "incoming" } as const,
            { kind: "has-left-entity", direction: "outgoing" } as const,
          ]).flat(),
        },
      ];

/** The `queryEntitySubgraph` request for one read: every given filter must match. */
export const hashEntityReadRequest = (
  input: HashEntityReadInput,
): QueryEntitySubgraphRequest => {
  const depth = Math.min(
    Math.max(Math.trunc(input.traversalDepth ?? defaultTraversalDepth), 0),
    maxTraversalDepth,
  );
  return {
    filter: {
      all: [
        ...anyOf(
          (input.entityTypes ?? []).map((type) => ({
            equal: [
              { path: ["type", isTypeUrl(type) ? "versionedUrl" : "title"] },
              { parameter: type },
            ],
          })),
        ),
        ...anyOf(
          (input.entityIds ?? []).map((entityId) => {
            const [webId, entityUuid] = splitEntityId(entityId as EntityId);
            return {
              all: [
                { equal: [{ path: ["webId"] }, { parameter: webId }] },
                { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
              ],
            };
          }),
        ),
        ...anyOf(
          (input.webIds ?? []).map((webId) => ({
            equal: [{ path: ["webId"] }, { parameter: webId }],
          })),
        ),
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    traversalPaths: traversalPathsTo(depth),
    includeDrafts: input.includeDrafts ?? false,
    includePermissions: false,
  };
};

/**
 * Every entity edition in the response, each described only from itself, so
 * its edition id is the edition whose properties it carries.
 */
export const hashEntityReadResult = (response: QueryEntitySubgraphQuery) => {
  const { subgraph } = deserializeQueryEntitySubgraphResponse(
    response.queryEntitySubgraph,
  );
  const matched = new Set(
    getRoots(subgraph).map(({ metadata }) => metadata.recordId.editionId),
  );
  return {
    entities: getEntities(subgraph, false).map((entity) => {
      const { entityId, editionId } = entity.metadata.recordId;
      const { linkData } = entity;
      return {
        entityId,
        editionId,
        webId: extractWebIdFromEntityId(entityId),
        entityTypeIds: entity.metadata.entityTypeIds,
        properties: entity.properties,
        draft: extractDraftIdFromEntityId(entityId) !== undefined,
        matched: matched.has(editionId),
        ...(linkData === undefined
          ? {}
          : {
              linkData: {
                leftEntityId: linkData.leftEntityId,
                rightEntityId: linkData.rightEntityId,
              },
            }),
      };
    }),
  };
};

/** Runs one `queryEntitySubgraph` request as the signed-in user. */
export type QueryEntitySubgraph = (
  request: QueryEntitySubgraphRequest,
  signal: AbortSignal,
) => Promise<QueryEntitySubgraphQuery>;

/**
 * Brunch's HASH entity read, run in the page. A failed query rejects, so the
 * call settles as a failed read and the agent sees a tool error.
 */
export const createHashEntityReadTool = (
  queryEntitySubgraph: QueryEntitySubgraph,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.queryHashEntities,
  inputSchema: hashEntityReadInputSchema,
  outputSchema: { parse: (value) => value },
  execute: async ({ input, signal }) =>
    hashEntityReadResult(
      await queryEntitySubgraph(
        hashEntityReadRequest(hashEntityReadInputSchema.parse(input)),
        signal,
      ),
    ),
});

/** The host tools HASH gives Brunch, bound to the page's Apollo client. */
export const useBrunchHashHostTools =
  (): readonly PetrinautAiAutomaticTool[] => {
    const apolloClient = useApolloClient();
    return useMemo(
      () => [
        createHashEntityReadTool(
          async (request, signal) =>
            (
              await apolloClient.query<
                QueryEntitySubgraphQuery,
                QueryEntitySubgraphQueryVariables
              >({
                query: queryEntitySubgraphQuery,
                variables: { request },
                // Each read reports the editions the graph holds now.
                fetchPolicy: "network-only",
                context: { fetchOptions: { signal } },
              })
            ).data,
        ),
      ],
      [apolloClient],
    );
  };
