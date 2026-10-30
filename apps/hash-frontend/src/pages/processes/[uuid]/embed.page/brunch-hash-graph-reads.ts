import { useApolloClient } from "@apollo/client";
import { useEffect, useMemo, useRef } from "react";
import * as z from "zod";

import { getEntities, getRoots } from "@blockprotocol/graph/stdlib";
import {
  type BaseUrl,
  type EntityId,
  type VersionedUrl,
  compareOntologyTypeVersions,
  extractBaseUrl,
  extractDraftIdFromEntityId,
  extractVersion,
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

import { queryEntityTypesQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { useAuthInfo } from "../../../shared/auth-info-context";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { User } from "../../../../lib/user-and-org";
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
  // How the agent shows the result; it doesn't change what is read.
  fullValuesFor: z.array(z.string()).optional(),
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
    // The entities' types, closed and resolved, for the titles and
    // descriptions of their types and properties.
    includeEntityTypes: "resolved",
  };
};

/** What the titles are read from in a response's closed multi-type map. */
type ClosedTypeTitlesMap = {
  schema: { allOf?: readonly { $id?: string; title?: string }[] };
  inner?: Record<string, ClosedTypeTitlesMap>;
};

/** Every type a closed multi-type map names, with its title, at any depth. */
const closedTypeTitles = (
  maps: Record<string, ClosedTypeTitlesMap> | undefined,
  titles = new Map<string, string>(),
) => {
  for (const { schema, inner } of Object.values(maps ?? {})) {
    for (const { $id, title } of schema.allOf ?? []) {
      if ($id !== undefined && title !== undefined) {
        titles.set($id, title);
      }
    }
    closedTypeTitles(inner, titles);
  }
  return titles;
};

/**
 * Every entity edition in the response, each described only from itself, so
 * its edition id is the edition whose properties it carries; and the title
 * and description of each property they carry, and the title of each type.
 */
export const hashEntityReadResult = (response: QueryEntitySubgraphQuery) => {
  const { subgraph, closedMultiEntityTypes, definitions } =
    deserializeQueryEntitySubgraphResponse(response.queryEntitySubgraph);
  const matched = new Set(
    getRoots(subgraph).map(({ metadata }) => metadata.recordId.editionId),
  );
  const entities = getEntities(subgraph, false);

  // Each property the entities carry, by base URL, from its latest version
  // the response resolved; and each type they carry, by its title.
  const usedBaseUrls = new Set(
    entities.flatMap(({ properties }) => Object.keys(properties)),
  );
  const propertyTypesByBaseUrl = new Map<
    BaseUrl,
    { versionedUrl: VersionedUrl; title: string; description?: string }
  >();
  for (const [versionedUrl, propertyType] of Object.entries(
    definitions?.propertyTypes ?? {},
  ) as [VersionedUrl, { title: string; description?: string }][]) {
    const baseUrl = extractBaseUrl(versionedUrl);
    const known = propertyTypesByBaseUrl.get(baseUrl);
    if (
      usedBaseUrls.has(baseUrl) &&
      (known === undefined ||
        compareOntologyTypeVersions(
          extractVersion(versionedUrl),
          extractVersion(known.versionedUrl),
        ) > 0)
    ) {
      propertyTypesByBaseUrl.set(baseUrl, {
        versionedUrl,
        title: propertyType.title,
        description: propertyType.description,
      });
    }
  }
  const typeTitles = closedTypeTitles(closedMultiEntityTypes);
  const usedTypeIds = new Set(
    entities.flatMap(({ metadata }) => metadata.entityTypeIds),
  );

  return {
    propertyTypes: [...propertyTypesByBaseUrl].map(
      ([baseUrl, { title, description }]) => ({
        baseUrl,
        title,
        ...(description === undefined ? {} : { description }),
      }),
    ),
    entityTypes: [...usedTypeIds].flatMap((entityTypeId) => {
      const title = typeTitles.get(entityTypeId);
      return title === undefined ? [] : [{ entityTypeId, title }];
    }),
    entities: entities.map((entity) => {
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
 * A read whose query failed settles with the failure's message, so the agent
 * can tell the model why. A cancelled call still rejects: nobody awaits it.
 */
const settlingQueryFailure = async <Result>(
  signal: AbortSignal,
  read: () => Promise<Result>,
): Promise<Result | { error: string }> => {
  try {
    return await read();
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    return {
      error: error instanceof Error ? error.message : "The HASH query failed.",
    };
  }
};

/**
 * Brunch's HASH entity read, run in the page. An input the agent's contract
 * doesn't allow rejects; a failed query settles `{ error }`.
 */
export const createHashEntityReadTool = (
  queryEntitySubgraph: QueryEntitySubgraph,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.queryHashEntities,
  inputSchema: hashEntityReadInputSchema,
  outputSchema: { parse: (value) => value },
  execute: async ({ input, signal }) => {
    const request = hashEntityReadRequest(
      hashEntityReadInputSchema.parse(input),
    );
    return settlingQueryFailure(signal, async () =>
      hashEntityReadResult(await queryEntitySubgraph(request, signal)),
    );
  },
});

/**
 * The input Brunch's HASH agent issues for its entity type read, narrowed as
 * for the entity read.
 */
const hashEntityTypeReadInputSchema = z.object({
  entityTypeIds: z.array(z.string()).optional(),
  webIds: z.array(z.string()).optional(),
});

export type HashEntityTypeReadInput = z.infer<
  typeof hashEntityTypeReadInputSchema
>;

export type QueryEntityTypesRequest = QueryEntityTypesQueryVariables["request"];

/**
 * The `queryEntityTypes` request for one read: every given filter must match.
 * Given type ids are read at exactly those versions, the ones the entities
 * carrying them were saved against; otherwise each type's latest version.
 * Types are closed over what they inherit and resolved, so the response
 * carries the titles of their properties and links.
 */
export const hashEntityTypeReadRequest = (
  input: HashEntityTypeReadInput,
): QueryEntityTypesRequest => ({
  filter: {
    all: [
      ...(input.entityTypeIds === undefined || input.entityTypeIds.length === 0
        ? [{ equal: [{ path: ["version"] }, { parameter: "latest" }] }]
        : anyOf(
            input.entityTypeIds.map((entityTypeId) => ({
              equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
            })),
          )),
      ...anyOf(
        (input.webIds ?? []).map((webId) => ({
          equal: [{ path: ["webId"] }, { parameter: webId }],
        })),
      ),
    ],
  },
  temporalAxes: currentTimeInstantTemporalAxes,
  includeEntityTypes: "resolved",
});

/**
 * Each returned type with its properties, keyed by the base URL an entity's
 * properties use, and its links, each titled where the response resolved it.
 */
export const hashEntityTypeReadResult = (response: QueryEntityTypesQuery) => {
  const { entityTypes, closedEntityTypes, definitions } =
    response.queryEntityTypes;
  const closedById = new Map(
    (closedEntityTypes ?? []).map((closed) => [closed.$id, closed]),
  );
  return {
    entityTypes: entityTypes.map(({ schema }) => {
      const closed = closedById.get(schema.$id);
      const properties = closed?.properties ?? schema.properties;
      const links = closed?.links ?? schema.links ?? {};
      return {
        entityTypeId: schema.$id,
        title: schema.title,
        description: schema.description,
        properties: Object.entries(properties).map(([baseUrl, value]) => {
          const title =
            definitions?.propertyTypes[
              "items" in value ? value.items.$ref : value.$ref
            ]?.title;
          return { baseUrl, ...(title === undefined ? {} : { title }) };
        }),
        links: Object.entries(links).map(([linkEntityTypeId, value]) => {
          const title =
            definitions?.entityTypes[linkEntityTypeId as VersionedUrl]?.title;
          return {
            linkEntityTypeId,
            ...(title === undefined ? {} : { title }),
            ...("oneOf" in value.items
              ? {
                  destinationEntityTypeIds: value.items.oneOf.map(
                    ({ $ref }) => $ref,
                  ),
                }
              : {}),
          };
        }),
      };
    }),
  };
};

/** Runs one `queryEntityTypes` request as the signed-in user. */
export type QueryEntityTypes = (
  request: QueryEntityTypesRequest,
  signal: AbortSignal,
) => Promise<QueryEntityTypesQuery>;

/**
 * Brunch's HASH entity type read, run in the page. An input the agent's
 * contract doesn't allow rejects; a failed query settles `{ error }`.
 */
export const createHashEntityTypeReadTool = (
  queryEntityTypes: QueryEntityTypes,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.queryHashEntityTypes,
  inputSchema: hashEntityTypeReadInputSchema,
  outputSchema: { parse: (value) => value },
  execute: async ({ input, signal }) => {
    const request = hashEntityTypeReadRequest(
      hashEntityTypeReadInputSchema.parse(input),
    );
    return settlingQueryFailure(signal, async () =>
      hashEntityTypeReadResult(await queryEntityTypes(request, signal)),
    );
  },
});

/** What the web read needs of the signed-in user. */
export type HashWebReadUser = Pick<
  User,
  "accountId" | "shortname" | "displayName"
> & {
  memberOf: readonly {
    org: Pick<User["memberOf"][number]["org"], "webId" | "shortname" | "name">;
  }[];
};

/** The signed-in user's own web, then each org web they belong to. */
export const hashWebReadResult = (user: HashWebReadUser | undefined) =>
  user === undefined
    ? { error: "No user is signed in to HASH." }
    : {
        webs: [
          {
            // A user's web id is their account id.
            webId: user.accountId,
            kind: "user" as const,
            ...(user.shortname === undefined
              ? {}
              : { shortname: user.shortname }),
            ...(user.displayName === undefined
              ? {}
              : { name: user.displayName }),
          },
          ...user.memberOf.map(({ org }) => ({
            webId: org.webId,
            kind: "organization" as const,
            shortname: org.shortname,
            name: org.name,
          })),
        ],
      };

const hashWebReadInputSchema = z.object({}).strict();

/**
 * Brunch's HASH web read, run in the page from the signed-in user it already
 * holds; it makes no request.
 */
export const createHashWebReadTool = (
  currentUser: () => HashWebReadUser | undefined,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.queryHashWebs,
  inputSchema: hashWebReadInputSchema,
  outputSchema: { parse: (value) => value },
  execute: ({ input }) => {
    hashWebReadInputSchema.parse(input);
    return hashWebReadResult(currentUser());
  },
});

/**
 * The host tools HASH gives Brunch, bound to the page's Apollo client and
 * signed-in user. The list keeps its identity while the user is refetched.
 */
export const useBrunchHashHostTools =
  (): readonly PetrinautAiAutomaticTool[] => {
    const apolloClient = useApolloClient();
    const { authenticatedUser } = useAuthInfo();
    const userRef = useRef(authenticatedUser);
    useEffect(() => {
      userRef.current = authenticatedUser;
    }, [authenticatedUser]);
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
        createHashEntityTypeReadTool(
          async (request, signal) =>
            (
              await apolloClient.query<
                QueryEntityTypesQuery,
                QueryEntityTypesQueryVariables
              >({
                query: queryEntityTypesQuery,
                variables: { request },
                fetchPolicy: "network-only",
                context: { fetchOptions: { signal } },
              })
            ).data,
        ),
        createHashWebReadTool(() => userRef.current),
      ],
      [apolloClient],
    );
  };
