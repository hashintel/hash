import { useApolloClient } from "@apollo/client";
import { useEffect, useMemo, useRef } from "react";

import { getEntities, getRoots } from "@blockprotocol/graph/stdlib";
import {
  type ClosedMultiEntityType,
  type EntityId,
  type VersionedUrl,
  extractBaseUrl,
  extractDraftIdFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import {
  brunchTools,
  type HashEntityCountInput,
  type HashEntityCountResult,
  type HashEntityReadInput,
  type HashEntityReadResult,
  type HashEntityTypeReadInput,
  type HashEntityTypeReadResult,
  type HashReadFailure,
  type HashWebReadResult,
  hashEntityReadDefaultTraversalDepth,
  hashEntityReadDefaultLimit,
  hashPropertyBaseUrl,
  parseHashEntityCountInput,
  parseHashEntityReadInput,
  parseHashEntityTypeReadInput,
  parseHashWebReadInput,
} from "@hashintel/brunch-agent";
import {
  deserializeQueryEntitySubgraphResponse,
  getClosedMultiEntityTypeFromMap,
  type QueryEntitySubgraphRequest,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  generateEntityEditionFilter,
  generateEntityIdFilter,
  pageOrNotificationNotArchivedFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitySubgraphQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { summarizeEntitiesQuery } from "../../../../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../../../../graphql/queries/ontology/entity-type.queries";
import { useAuthInfo } from "../../../../../shared/auth-info-context";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
  SummarizeEntitiesQuery,
  SummarizeEntitiesQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type { User } from "../../../../../../lib/user-and-org";
import type { PetrinautAiAutomaticTool } from "@hashintel/brunch-agent/ui";
import type {
  EntityQueryCursor,
  EntityTraversalEdge,
  EntityTraversalPath,
  Filter,
} from "@local/hash-graph-client";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";

const isTypeUrl = (type: string) =>
  type.startsWith("http://") || type.startsWith("https://");

const anyOf = (filters: Filter[]): Filter[] =>
  filters.length === 0 ? [] : [{ any: filters }];

/**
 * Entities of any of these types: a title matches every type with that title,
 * at any version; a type URL matches that version only.
 */
const entityTypesFilter = (entityTypes: readonly string[] = []): Filter[] =>
  anyOf(
    entityTypes.map((type) => ({
      equal: [
        { path: ["type", isTypeUrl(type) ? "versionedUrl" : "title"] },
        { parameter: type },
      ],
    })),
  );

/**
 * Entities whose properties hold every one of these values exactly, each
 * property named by its base URL, or by a versioned id reduced to one: an
 * entity's properties are keyed by base URL.
 */
const propertyEqualsFilter = (
  propertyEquals: HashEntityReadInput["propertyEquals"] = [],
): Filter[] =>
  propertyEquals.map(({ property, value }) => ({
    equal: [
      { path: ["properties", hashPropertyBaseUrl(property)] },
      { parameter: value },
    ],
  }));

/** Entities in any of these webs. */
const webIdsFilter = (webIds: readonly string[] = []): Filter[] =>
  anyOf(
    webIds.map((webId) => ({
      equal: [{ path: ["webId"] }, { parameter: webId }],
    })),
  );

/**
 * Entities archived neither by their metadata flag nor, as pages and
 * notifications are, by their `archived` property.
 */
const notArchivedFilters: Filter[] = [
  { equal: [{ path: ["archived"] }, { parameter: false }] },
  pageOrNotificationNotArchivedFilter,
];

/** What the reads need of the signed-in user. */
export type HashWebReadUser = Pick<
  User,
  "accountId" | "shortname" | "displayName"
> & {
  memberOf: readonly {
    org: Pick<User["memberOf"][number]["org"], "webId" | "shortname" | "name">;
  }[];
};

const noUserSignedIn: HashReadFailure = {
  error: "No user is signed in to HASH.",
};

/** The signed-in user's own web, then each org web they belong to. */
const websOf = (user: HashWebReadUser): HashWebReadResult["webs"] => [
  {
    // A user's web id is their account id.
    webId: user.accountId,
    kind: "user" as const,
    ...(user.shortname === undefined ? {} : { shortname: user.shortname }),
    ...(user.displayName === undefined ? {} : { name: user.displayName }),
  },
  ...user.memberOf.map(({ org }) => ({
    webId: org.webId,
    kind: "organization" as const,
    shortname: org.shortname,
    name: org.name,
  })),
];

/**
 * The webs a read covers: those its input names (`named`), else the
 * signed-in user's own web and each org web they belong to (`default`), so a
 * read that names no web never reaches into HASH's shared webs or other
 * users'. With no web named and no user signed in, there is nothing to cover.
 */
export type HashReadWebScope = {
  readonly scope: "default" | "named";
  readonly webIds: readonly string[];
};

export const hashReadWebScope = (
  webIds: readonly string[] | undefined,
  user: HashWebReadUser | undefined,
): HashReadWebScope | HashReadFailure => {
  if (webIds !== undefined) {
    return { scope: "named", webIds: [...new Set(webIds)] };
  }
  return user === undefined
    ? noUserSignedIn
    : { scope: "default", webIds: websOf(user).map(({ webId }) => webId) };
};

/**
 * The webs an entity read is limited to. A read by `entityIds` alone is
 * limited to none: an entity id names its web, so a named entity is read
 * wherever it is. Otherwise the read's web scope (`hashReadWebScope`): the
 * webs named, else the user's own and org webs.
 */
export const hashEntityReadWebIds = (
  input: HashEntityReadInput,
  user: HashWebReadUser | undefined,
): { readonly webIds?: readonly string[] } | HashReadFailure => {
  if (input.entityIds !== undefined && input.webIds === undefined) {
    return {};
  }
  const webScope = hashReadWebScope(input.webIds, user);
  return "error" in webScope ? webScope : { webIds: webScope.webIds };
};

/**
 * The webs whose entities a read returns unmarked: the user's own and their
 * orgs'. Every other entity is external, and with no user signed in, all are.
 */
const ownWebIdsOf = (user: HashWebReadUser | undefined): ReadonlySet<string> =>
  new Set(user === undefined ? [] : websOf(user).map(({ webId }) => webId));

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
 * which bounds `depth` at `hashEntityReadMaxTraversalDepth`.
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

const namedDraftIds = (input: HashEntityReadInput): Set<EntityId> =>
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
  input: HashEntityReadInput,
): ReadonlySet<EntityId> | undefined => {
  const named = namedDraftIds(input);
  return input.includeDrafts === true || named.size === 0 ? undefined : named;
};

/**
 * The graph's cursor as the opaque text the model passes back: its JSON,
 * base64url-encoded, so it is one plain word the model copies whole, with no
 * quotes or brackets to escape or to mistake for structure.
 */
export const encodeHashEntityReadCursor = (cursor: EntityQueryCursor) => {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
};

const malformedCursor: HashReadFailure = {
  error:
    "The cursor isn't one this read gave. Repeat the read without a cursor to start from the first page.",
};

/**
 * The graph's cursor back from the text `encodeHashEntityReadCursor` made,
 * exactly; text that isn't one fails. The graph checks the values inside.
 */
export const decodeHashEntityReadCursor = (
  text: string,
): EntityQueryCursor | HashReadFailure => {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(text)) {
      return malformedCursor;
    }
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    const cursor: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    );
    return Array.isArray(cursor) && cursor.length > 0
      ? (cursor as EntityQueryCursor)
      : malformedCursor;
  } catch {
    return malformedCursor;
  }
};

/**
 * The `queryEntitySubgraph` request for one page of a read, limited to
 * `webIds` (from `hashEntityReadWebIds`, never the input's own): every given
 * filter must match. An entity id that names a draft reads that draft,
 * whether or not drafts were asked for; unless they were, an id without a
 * draft part reads only the live entity, and of the drafts the graph returns
 * the read keeps only those named (`hashEntityReadOnlyDrafts`). The page
 * holds up to the input's `limit` of matches, by default the most the graph
 * returns, starting at `cursor`, the input's decoded
 * (`decodeHashEntityReadCursor`), or else at the first match.
 */
export const hashEntityReadRequest = (
  input: HashEntityReadInput,
  webIds: readonly string[] | undefined,
  cursor?: EntityQueryCursor,
): QueryEntitySubgraphRequest => {
  if (webIds?.length === 0) {
    // No web filter at all would read every web the user can see.
    throw new Error("An entity read's web scope can't be empty.");
  }
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
        ...entityTypesFilter(input.entityTypes),
        ...propertyEqualsFilter(input.propertyEquals),
        ...anyOf(entityIds.map(entityIdFilter)),
        ...webIdsFilter(webIds),
        ...notArchivedFilters,
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    traversalPaths: traversalPathsTo(
      input.traversalDepth ?? hashEntityReadDefaultTraversalDepth,
    ),
    includeDrafts: input.includeDrafts === true || namesDraft,
    includePermissions: false,
    // The entities' types, closed and resolved, for the titles and
    // descriptions of their types and properties.
    includeEntityTypes: "resolved",
    limit: input.limit ?? hashEntityReadDefaultLimit,
    ...(cursor === undefined ? {} : { cursor }),
  };
};

const archivedBaseUrl = systemPropertyTypes.archived.propertyTypeBaseUrl;

/**
 * A type response carries a cursor when the graph stopped at its limit of
 * matches, so more may match than it returned. The type read doesn't follow it.
 */
const truncatedWhen = (cursor: unknown) =>
  cursor === undefined || cursor === null ? {} : { truncated: true as const };

/** The closed type of an entity with these types, if the response has it. */
const closedTypeIn = (
  closedMultiEntityTypes: ClosedMultiEntityTypesRootMap | undefined,
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]],
): ClosedMultiEntityType | undefined => {
  try {
    return getClosedMultiEntityTypeFromMap(
      closedMultiEntityTypes,
      entityTypeIds,
    );
  } catch {
    return undefined;
  }
};

/** Collect actual keys, including nested objects and arrays; definitions remain authoritative. */
const collectPropertyKeys = (value: unknown, found: Set<string>) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPropertyKeys(item, found);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      found.add(key);
      collectPropertyKeys(item, found);
    }
  }
};

/**
 * Every entity edition in the response, each described only from itself, so
 * its edition id is the edition whose properties it carries, and labelled
 * where its closed type was resolved; and the title and description of each
 * candidate property definition matched by a returned key, and the title of each type. An entity archived through
 * its `archived` property, as pages are, is left out: the request's filter
 * applies only to the matches, not to the entities reached by following links.
 * Given `onlyDrafts`, retain named drafts and draft links whose endpoint is
 * a named draft, without expanding that set. Other drafts are left out;
 * links to excluded entities keep their endpoint ids. An entity in none of
 * `ownWebIds`, the user's own and org webs, is marked `external`, however it
 * was reached. The graph returns a cursor when the page holds as many
 * matches as its limit, so more may match; the result carries it encoded
 * (`encodeHashEntityReadCursor`) for the next page's read.
 */
export const hashEntityReadResult = (
  response: QueryEntitySubgraphQuery,
  ownWebIds: ReadonlySet<string>,
  onlyDrafts?: ReadonlySet<EntityId>,
): HashEntityReadResult => {
  const { subgraph, closedMultiEntityTypes, definitions, cursor } =
    deserializeQueryEntitySubgraphResponse(response.queryEntitySubgraph);
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
    })
    .map((entity) => ({
      entity,
      closedType: closedTypeIn(
        closedMultiEntityTypes,
        entity.metadata.entityTypeIds,
      ),
    }));

  // Key matches select candidate definitions, not ownership or applicability.
  // Preserve every returned version rather than choosing one global definition.
  const usedBaseUrls = new Set<string>();
  for (const { entity } of entities) {
    collectPropertyKeys(entity.properties, usedBaseUrls);
  }
  const propertyTypes = Object.values(definitions?.propertyTypes ?? {}).flatMap(
    ({ $id, title, description }) => {
      const baseUrl = extractBaseUrl($id);
      return usedBaseUrls.has(baseUrl)
        ? [
            {
              baseUrl,
              propertyTypeId: $id,
              title,
              description,
            },
          ]
        : [];
    },
  );
  const typeTitles = new Map(
    entities.flatMap(({ closedType }) =>
      (closedType?.allOf ?? []).map(({ $id, title }) => [$id, title] as const),
    ),
  );
  const usedTypeIds = new Set(
    entities.flatMap(({ entity }) => entity.metadata.entityTypeIds),
  );

  return {
    propertyTypes,
    entityTypes: [...usedTypeIds].flatMap((entityTypeId) => {
      const title = typeTitles.get(entityTypeId);
      return title === undefined ? [] : [{ entityTypeId, title }];
    }),
    entities: entities.map(({ entity, closedType }) => {
      const { entityId, editionId } = entity.metadata.recordId;
      const { linkData } = entity;
      const webId = extractWebIdFromEntityId(entityId);
      return {
        entityId,
        editionId,
        webId,
        ...(ownWebIds.has(webId) ? {} : { external: true as const }),
        entityTypeIds: entity.metadata.entityTypeIds,
        ...(closedType === undefined
          ? {}
          : { label: generateEntityLabel(closedType, entity) }),
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
    ...(cursor === undefined || cursor === null
      ? {}
      : { cursor: encodeHashEntityReadCursor(cursor) }),
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
): Promise<Result | HashReadFailure> => {
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
 * Brunch's HASH entity read, run in the page, over the webs in scope for the
 * user signed in when it runs, marking entities outside their webs external.
 * One call reads one page, from the input's cursor if it has one. An input
 * the agent's contract doesn't allow rejects; a failed query, a cursor this
 * read didn't give, or a read that names neither webs nor entities with no
 * user to scope to, settles `{ error }`.
 */
export const createHashEntityReadTool = (
  queryEntitySubgraph: QueryEntitySubgraph,
  currentUser: () => HashWebReadUser | undefined,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.hashQueryEntities,
  inputParser: { parse: parseHashEntityReadInput },
  outputParser: { parse: (value) => value },
  execute: async ({ input, signal }) => {
    const readInput = parseHashEntityReadInput(input);
    const cursor =
      readInput.cursor === undefined
        ? undefined
        : decodeHashEntityReadCursor(readInput.cursor);
    if (cursor !== undefined && "error" in cursor) {
      return cursor;
    }
    const user = currentUser();
    const webScope = hashEntityReadWebIds(readInput, user);
    if ("error" in webScope) {
      return webScope;
    }
    const request = hashEntityReadRequest(readInput, webScope.webIds, cursor);
    return settlingQueryFailure(signal, async () =>
      hashEntityReadResult(
        await queryEntitySubgraph(request, signal),
        ownWebIdsOf(user),
        hashEntityReadOnlyDrafts(readInput),
      ),
    );
  },
});

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
export const hashEntityTypeReadResult = (
  response: QueryEntityTypesQuery,
): HashEntityTypeReadResult => {
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
  toolName: brunchTools.hashQueryEntityTypes,
  inputParser: { parse: parseHashEntityTypeReadInput },
  outputParser: { parse: (value) => value },
  execute: async ({ input, signal }) => {
    const request = hashEntityTypeReadRequest(
      parseHashEntityTypeReadInput(input),
    );
    return settlingQueryFailure(signal, async () =>
      hashEntityTypeReadResult(await queryEntityTypes(request, signal)),
    );
  },
});

/** The signed-in user's own web, then each org web they belong to. */
export const hashWebReadResult = (
  user: HashWebReadUser | undefined,
): HashWebReadResult | HashReadFailure =>
  user === undefined ? noUserSignedIn : { webs: websOf(user) };

export type SummarizeEntitiesRequest =
  SummarizeEntitiesQueryVariables["request"];

/**
 * The `summarizeEntities` request for one count: the entity read's filters
 * for types, property values and for not being archived, limited to the webs in scope, with
 * the total, the count per direct type and its title, and the count per web.
 * Drafts are not counted.
 */
export const hashEntityCountRequest = (
  input: HashEntityCountInput,
  webIds: readonly string[],
): SummarizeEntitiesRequest => ({
  filter: {
    all: [
      ...entityTypesFilter(input.entityTypes),
      ...propertyEqualsFilter(input.propertyEquals),
      ...webIdsFilter(webIds),
      ...notArchivedFilters,
    ],
  },
  temporalAxes: currentTimeInstantTemporalAxes,
  includeDrafts: false,
  includeCount: true,
  includeTypeIds: true,
  includeTypeTitles: true,
  includeWebIds: true,
});

/**
 * The count, each direct type counted, most first, with its title, and every
 * web in scope with its count, named where it is the user's own or one of
 * their orgs'. A response without a count fails the count.
 */
export const hashEntityCountResult = (
  response: SummarizeEntitiesQuery,
  { scope, webIds }: HashReadWebScope,
  user: HashWebReadUser | undefined,
): HashEntityCountResult => {
  const {
    count,
    typeIds = {},
    typeTitles = {},
    webIds: webCounts = {},
  } = response.summarizeEntities;
  if (count === undefined) {
    throw new Error("HASH's graph returned a summary without a count.");
  }
  const known = new Map(
    (user === undefined ? [] : websOf(user)).map((web) => [web.webId, web]),
  );
  return {
    count,
    webScope: scope,
    entityTypes: Object.entries(typeIds)
      .map(([entityTypeId, typeCount]) => {
        const title = typeTitles[entityTypeId as VersionedUrl];
        return {
          entityTypeId,
          ...(title === undefined ? {} : { title }),
          count: typeCount,
        };
      })
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.entityTypeId.localeCompare(right.entityTypeId),
      ),
    webs: webIds.map((webId) => ({
      ...known.get(webId),
      webId,
      count: webCounts[webId as keyof typeof webCounts] ?? 0,
    })),
  };
};

/** Runs one `summarizeEntities` request as the signed-in user. */
export type SummarizeEntities = (
  request: SummarizeEntitiesRequest,
  signal: AbortSignal,
) => Promise<SummarizeEntitiesQuery>;

/**
 * Brunch's HASH entity count, run in the page: one `summarizeEntities`
 * request over the webs in scope. An input the agent's contract doesn't
 * allow rejects; a failed query, or no user to scope to, settles `{ error }`.
 */
export const createHashEntityCountTool = (
  summarizeEntities: SummarizeEntities,
  currentUser: () => HashWebReadUser | undefined,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.hashCountEntities,
  inputParser: { parse: parseHashEntityCountInput },
  outputParser: { parse: (value) => value },
  execute: async ({ input, signal }) => {
    const countInput = parseHashEntityCountInput(input);
    const user = currentUser();
    const webScope = hashReadWebScope(countInput.webIds, user);
    if ("error" in webScope) {
      return webScope;
    }
    const request = hashEntityCountRequest(countInput, webScope.webIds);
    return settlingQueryFailure(signal, async () =>
      hashEntityCountResult(
        await summarizeEntities(request, signal),
        webScope,
        user,
      ),
    );
  },
});

/**
 * Brunch's HASH web read, run in the page from the signed-in user it already
 * holds; it takes no input and makes no request.
 */
export const createHashWebReadTool = (
  currentUser: () => HashWebReadUser | undefined,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.hashQueryWebs,
  inputParser: { parse: parseHashWebReadInput },
  outputParser: { parse: (value) => value },
  execute: () => hashWebReadResult(currentUser()),
});

/**
 * The HASH graph reads the page gives Brunch, bound to the page's Apollo client and
 * signed-in user. The list keeps its identity while the user is refetched.
 */
export const useBrunchHashGraphReadTools =
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
          () => userRef.current,
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
        createHashEntityCountTool(
          async (request, signal) =>
            (
              await apolloClient.query<
                SummarizeEntitiesQuery,
                SummarizeEntitiesQueryVariables
              >({
                query: summarizeEntitiesQuery,
                variables: { request },
                // Each count reports what the graph holds now.
                fetchPolicy: "network-only",
                context: { fetchOptions: { signal } },
              })
            ).data,
          () => userRef.current,
        ),
      ],
      [apolloClient],
    );
  };
