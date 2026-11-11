import { useApolloClient } from "@apollo/client";
import { useEffect, useMemo, useRef } from "react";
import * as z from "zod";

import { getEntities, getRoots } from "@blockprotocol/graph/stdlib";
import {
  type EntityId,
  type VersionedUrl,
  extractDraftIdFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { brunchTools } from "@hashintel/brunch-agent";
import {
  deserializeQueryEntitySubgraphResponse,
  type QueryEntitySubgraphRequest,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateEntityEditionFilter,
  generateEntityIdFilter,
  pageOrNotificationNotArchivedFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { queryEntityTypesQuery } from "../../../../../../graphql/queries/ontology/entity-type.queries";
import { useAuthInfo } from "../../../../../shared/auth-info-context";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type { User } from "../../../../../../lib/user-and-org";
import type { PetrinautAiAutomaticTool } from "@hashintel/brunch-agent/ui";
import type {
  EntityTraversalEdge,
  EntityTraversalPath,
  Filter,
} from "@local/hash-graph-client";

/**
 * The input Brunch's HASH agent issues for its entity read. The agent's
 * schema is the authority and has already validated it; this only narrows it.
 */
const zHashEntityReadInput = z.object({
  entityTypes: z.array(z.string()).optional(),
  webIds: z.array(z.string()).optional(),
  entityIds: z.array(z.string()).optional(),
  traversalDepth: z.number().int().min(0).max(3).optional(),
  includeDrafts: z.boolean().optional(),
});

/** An entity read as the agent issued it to the page, narrowed. */
export type IssuedHashEntityRead = z.infer<typeof zHashEntityReadInput>;

const defaultTraversalDepth = 1;

const isTypeUrl = (type: string) =>
  type.startsWith("http://") || type.startsWith("https://");

const anyOf = (filters: Filter[]): Filter[] =>
  filters.length === 0 ? [] : [{ any: filters }];

/** One link from an entity, followed to the entity on its other end. */
const linkHops: readonly (readonly EntityTraversalEdge[])[] = [
  [
    { kind: "has-left-entity", direction: "incoming" },
    { kind: "has-right-entity", direction: "outgoing" },
  ],
  [
    { kind: "has-right-entity", direction: "incoming" },
    { kind: "has-left-entity", direction: "outgoing" },
  ],
];

/**
 * Every chain of `depth` links from the matched entities, each link followed
 * in either direction, and a matched link entity's own endpoints. A path
 * returns each entity along it, so the chains of `depth` links also reach
 * every shallower one. The graph takes at most 10 paths of at most 10 edges,
 * which bounds `depth` at 3: 8 chains of 6 edges, and the 2 endpoint paths.
 */
const traversalPathsTo = (depth: number): EntityTraversalPath[] => {
  if (depth === 0) {
    return [];
  }
  let chains: EntityTraversalEdge[][] = [[]];
  for (let hop = 0; hop < depth; hop++) {
    chains = chains.flatMap((chain) =>
      linkHops.map((linkHop) => [...chain, ...linkHop]),
    );
  }
  return [
    ...chains.map((edges) => ({ edges })),
    { edges: [{ kind: "has-left-entity", direction: "outgoing" }] },
    { edges: [{ kind: "has-right-entity", direction: "outgoing" }] },
  ];
};

const namedDraftIds = (input: IssuedHashEntityRead): Set<EntityId> =>
  new Set(
    (input.entityIds ?? [])
      .map((entityId) => entityId as EntityId)
      .filter((entityId) => extractDraftIdFromEntityId(entityId) !== undefined),
  );

/**
 * When named drafts alone enable drafts query-wide, scope drafts to those
 * named and links touching them. Otherwise leave the draft scope unchanged.
 */
const hashEntityReadOnlyDrafts = (
  input: IssuedHashEntityRead,
): ReadonlySet<EntityId> | undefined => {
  const named = namedDraftIds(input);
  return input.includeDrafts === true || named.size === 0 ? undefined : named;
};

/**
 * The `queryEntitySubgraph` request for one read: every given filter must
 * match. An entity id that names a draft reads that draft, whether or not
 * drafts were asked for; unless they were, an id without a draft part reads
 * only the live entity.
 */
export const hashEntityReadRequest = (
  input: IssuedHashEntityRead,
): QueryEntitySubgraphRequest => {
  const entityIds = (input.entityIds ?? []).map(
    (entityId) => entityId as EntityId,
  );
  const namesDraft = namedDraftIds(input).size > 0;
  const entityIdFilter = (entityId: EntityId): Filter =>
    input.includeDrafts === true
      ? generateEntityIdFilter({ entityId, includeArchived: true })
      : generateEntityEditionFilter(entityId);
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
        ...anyOf(entityIds.map(entityIdFilter)),
        ...anyOf(
          (input.webIds ?? []).map((webId) => ({
            equal: [{ path: ["webId"] }, { parameter: webId }],
          })),
        ),
        { equal: [{ path: ["archived"] }, { parameter: false }] },
        pageOrNotificationNotArchivedFilter,
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    traversalPaths: traversalPathsTo(
      input.traversalDepth ?? defaultTraversalDepth,
    ),
    includeDrafts: input.includeDrafts === true || namesDraft,
    includePermissions: false,
  };
};

const archivedBaseUrl = systemPropertyTypes.archived.propertyTypeBaseUrl;

/**
 * A response carries a cursor when the graph stopped at its limit of matches,
 * so more may match than it returned. The read doesn't follow it.
 */
const truncatedWhen = (cursor: unknown) =>
  cursor === undefined || cursor === null ? {} : { truncated: true as const };

/**
 * Every entity edition in the response, each described only from itself, so
 * its edition id is the edition whose properties it carries. An entity
 * archived through its `archived` property, as pages are, is left out: the
 * request's filter applies only to the matches, not to the entities reached
 * by following links. Given `onlyDrafts`, retain named drafts and draft links
 * whose endpoint is a named draft, without expanding that set. Other drafts
 * are left out; links to excluded entities keep their endpoint ids.
 */
export const hashEntityReadResult = (
  response: QueryEntitySubgraphQuery,
  onlyDrafts?: ReadonlySet<EntityId>,
) => {
  const { subgraph, cursor } = deserializeQueryEntitySubgraphResponse(
    response.queryEntitySubgraph,
  );
  const matched = new Set(
    getRoots(subgraph).map(({ metadata }) => metadata.recordId.editionId),
  );
  const entities = getEntities(subgraph, false)
    .filter((entity) => entity.properties[archivedBaseUrl] !== true)
    .filter(({ metadata: { recordId }, linkData }) => {
      const { entityId } = recordId;
      return (
        onlyDrafts === undefined ||
        extractDraftIdFromEntityId(entityId) === undefined ||
        onlyDrafts.has(entityId) ||
        (linkData !== undefined &&
          (onlyDrafts.has(linkData.leftEntityId) ||
            onlyDrafts.has(linkData.rightEntityId)))
      );
    });
  return {
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
    ...truncatedWhen(cursor),
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
  inputSchema: zHashEntityReadInput,
  outputSchema: { parse: (value) => value },
  execute: async ({ input, signal }) => {
    const readInput = zHashEntityReadInput.parse(input);
    const request = hashEntityReadRequest(readInput);
    return settlingQueryFailure(signal, async () =>
      hashEntityReadResult(
        await queryEntitySubgraph(request, signal),
        hashEntityReadOnlyDrafts(readInput),
      ),
    );
  },
});

/**
 * The input Brunch's HASH agent issues for its entity type read, narrowed as
 * for the entity read.
 */
const zHashEntityTypeReadInput = z.object({
  entityTypeIds: z.array(z.string()).optional(),
  webIds: z.array(z.string()).optional(),
});

/** An entity type read as the agent issued it to the page, narrowed. */
export type IssuedHashEntityTypeRead = z.infer<typeof zHashEntityTypeReadInput>;

export type QueryEntityTypesRequest = QueryEntityTypesQueryVariables["request"];

/**
 * The `queryEntityTypes` request for one read: every given filter must match.
 * Given type ids are read at exactly those versions, the ones the entities
 * carrying them were saved against; otherwise each type's latest version.
 * Types are closed over what they inherit and resolved, so the response
 * carries the titles of their properties and links.
 */
export const hashEntityTypeReadRequest = (
  input: IssuedHashEntityTypeRead,
): QueryEntityTypesRequest => ({
  filter: {
    all: [
      ...(input.entityTypeIds === undefined
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
  const { entityTypes, closedEntityTypes, definitions, cursor } =
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
    ...truncatedWhen(cursor),
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
  inputSchema: zHashEntityTypeReadInput,
  outputSchema: { parse: (value) => value },
  execute: async ({ input, signal }) => {
    const request = hashEntityTypeReadRequest(
      zHashEntityTypeReadInput.parse(input),
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

/**
 * Brunch's HASH web read, run in the page from the signed-in user it already
 * holds; it takes no input and makes no request.
 */
export const createHashWebReadTool = (
  currentUser: () => HashWebReadUser | undefined,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.queryHashWebs,
  inputSchema: z.object({}),
  outputSchema: { parse: (value) => value },
  execute: () => hashWebReadResult(currentUser()),
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
