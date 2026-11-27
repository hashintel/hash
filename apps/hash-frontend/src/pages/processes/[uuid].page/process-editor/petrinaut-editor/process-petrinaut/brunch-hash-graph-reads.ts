import { useApolloClient } from "@apollo/client";
import { useEffect, useMemo, useRef } from "react";
import { z } from "zod";

import { type QueryTemporalAxes } from "@blockprotocol/graph";
import { getEntities, getRoots } from "@blockprotocol/graph/stdlib";
import {
  type ClosedMultiEntityType,
  type EntityId,
  type VersionedUrl,
  type WebId,
  extractBaseUrl,
  extractDraftIdFromEntityId,
  extractWebIdFromEntityId,
  validateVersionedUrl,
} from "@blockprotocol/type-system";
import {
  brunchTools,
  type HashEntityCountInput,
  type HashEntityCountResult,
  type HashEntityReadInput,
  type HashEntityReadOversized,
  type HashEntityReadResult,
  type HashEntityTypeReadInput,
  type HashEntityTypeReadOversized,
  type HashEntityTypeReadResult,
  type HashJoinEndpointAnchor,
  type HashJoinEntity,
  type HashJoinGraph,
  type HashJoinTypeSelector,
  type HashReadFailure,
  type HashWebReadResult,
  type HashWebScope,
  hashEntityReadDefaultLimit,
  hashEntityReadDefaultTraversalDepth,
  hashEntityReadMaxPayloadBytes,
  hashEntityTypeReadDefaultLimit,
  hashEntityTypeSelectorKind,
  hashIsPublishedVersionedUrl,
  hashPropertyBaseUrl,
  hashPropertySlug,
  hashReadLabelPreviewLength,
  parseHashEntityCountInput,
  parseHashEntityReadInput,
  parseHashEntityTypeReadInput,
  parseHashWebReadInput,
  runHashEntityJoinCount,
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

const anyOf = (filters: Filter[]): Filter[] =>
  filters.length === 0 ? [] : [{ any: filters }];

/**
 * Entities of any of these types: a title matches every type with that title
 * at any version; a type base URL matches all versions of that type; a
 * published versioned type URL matches that version only.
 */
const entityTypesFilter = (entityTypes: readonly string[] = []): Filter[] =>
  anyOf(
    entityTypes.map((type) => ({
      equal: [
        { path: ["type", hashEntityTypeSelectorKind(type)] },
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
type HashReadWebScope = {
  readonly scope: HashWebScope;
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
const ownWebIdsOf = (user: HashWebReadUser | undefined): ReadonlySet<WebId> =>
  new Set<WebId>(
    user === undefined
      ? []
      : [user.accountId, ...user.memberOf.map(({ org }) => org.webId)],
  );

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

const namedDraftIds = (
  input: Pick<HashEntityReadInput, "entityIds">,
): Set<EntityId> =>
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

/** Decoded pagination state carried across entity-read pages. */
export type HashEntityReadCursor = {
  readonly cursor: EntityQueryCursor;
  readonly temporalAxes?: QueryTemporalAxes;
};

const limitedBoundSchema = z.strictObject({
  kind: z.enum(["inclusive", "exclusive"]),
  limit: z.string().min(1),
});

const temporalBoundSchema = z.union([
  z.strictObject({ kind: z.literal("unbounded") }),
  limitedBoundSchema,
]);

const temporalIntervalSchema = z.strictObject({
  start: temporalBoundSchema,
  end: limitedBoundSchema,
});

const queryTemporalAxesSchema = z.union([
  z.strictObject({
    variable: z.strictObject({
      axis: z.literal("decisionTime"),
      interval: temporalIntervalSchema,
    }),
    pinned: z.strictObject({
      axis: z.literal("transactionTime"),
      timestamp: z.string().min(1),
    }),
  }),
  z.strictObject({
    variable: z.strictObject({
      axis: z.literal("transactionTime"),
      interval: temporalIntervalSchema,
    }),
    pinned: z.strictObject({
      axis: z.literal("decisionTime"),
      timestamp: z.string().min(1),
    }),
  }),
]) as unknown as z.ZodType<QueryTemporalAxes>;

const hashEntityReadCursorSchema = z.strictObject({
  cursor: z.array(z.unknown()).min(1),
  temporalAxes: queryTemporalAxesSchema.optional(),
});

/**
 * The graph's cursor and optional resolved snapshot time as opaque base64url
 * text the model copies whole, with no quotes or brackets to escape.
 */
export const encodeHashEntityReadCursor = (
  cursor: EntityQueryCursor,
  temporalAxes?: QueryTemporalAxes,
) => {
  const payload =
    temporalAxes === undefined ? { cursor } : { cursor, temporalAxes };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
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

const malformedTypeCursor: HashReadFailure = {
  error:
    "The cursor isn't one this type read gave. Repeat the read without a cursor to start from the first page.",
};

/**
 * Decodes the text `encodeHashEntityReadCursor` made, validating both the
 * graph cursor array and any pinned `temporalAxes`.
 */
export const decodeHashEntityReadCursor = (
  text: string,
): HashEntityReadCursor | HashReadFailure => {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(text)) {
      return malformedCursor;
    }
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    const decoded: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    );
    const parsed = hashEntityReadCursorSchema.safeParse(decoded);
    if (!parsed.success) {
      return malformedCursor;
    }
    return {
      cursor: parsed.data.cursor,
      ...(parsed.data.temporalAxes === undefined
        ? {}
        : { temporalAxes: parsed.data.temporalAxes }),
    };
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
 * holds up to the input's `limit` of matches (default `hashEntityReadDefaultLimit`,
 * 100), starting at `pageCursor` (from `decodeHashEntityReadCursor`) at its
 * pinned `temporalAxes` when continuing a read, or else at the first match.
 */
export const hashEntityReadRequest = (
  input: Omit<HashEntityReadInput, "webIds" | "cursor">,
  webIds: readonly string[] | undefined,
  pageCursor?: HashEntityReadCursor,
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
        ...(input.includeArchived === true ? [] : notArchivedFilters),
      ],
    },
    temporalAxes: pageCursor?.temporalAxes ?? currentTimeInstantTemporalAxes,
    traversalPaths: traversalPathsTo(
      input.traversalDepth ?? hashEntityReadDefaultTraversalDepth,
    ),
    includeDrafts: input.includeDrafts === true || namesDraft,
    includePermissions: false,
    // The entities' types, closed and resolved, for the titles and
    // descriptions of their types and properties.
    includeEntityTypes: "resolved",
    limit: input.limit ?? hashEntityReadDefaultLimit,
    ...(pageCursor === undefined ? {} : { cursor: pageCursor.cursor }),
  };
};

const archivedBaseUrl = systemPropertyTypes.archived.propertyTypeBaseUrl;

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
 * When `properties` is set, keeps only chosen property base URLs plus any
 * property targeted by `fullValuesFor` (a whole-entity id keeps every property
 * on that entity; `{ entityId, path }` keeps the top-level property matching
 * `path[0]` by exact key, base URL, or shared slug).
 */
const projectEntityProperties = (
  entityId: string,
  properties: Record<string, unknown>,
  selectedBaseUrls: ReadonlySet<string> | undefined,
  fullValuesFor: HashEntityReadInput["fullValuesFor"] = [],
): Record<string, unknown> => {
  if (selectedBaseUrls === undefined) {
    return properties;
  }
  if (fullValuesFor.some((entry) => entry === entityId)) {
    return properties;
  }
  const pathFirstSteps = fullValuesFor.flatMap((entry) =>
    typeof entry === "object" &&
    entry.entityId === entityId &&
    entry.path[0] !== undefined
      ? [entry.path[0]]
      : [],
  );
  // Build via `Object.fromEntries` (`CreateDataPropertyOrThrow`) so an own
  // `"__proto__"` property key never mutates the projected object's prototype.
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) =>
        selectedBaseUrls.has(key) ||
        pathFirstSteps.some(
          (step) =>
            key === step ||
            key === hashPropertyBaseUrl(step) ||
            hashPropertySlug(key) === step,
        ),
    ),
  );
};

/**
 * Every entity edition in the response, each described only from itself, so
 * its edition id is the edition whose properties it carries, and labelled
 * where its closed type was resolved; and the title and description of each
 * candidate property definition matched by a returned key, and the title of
 * each type. Unless `includeArchived` is true, entities archived by either
 * `metadata.archived` or their `archived` property are left out (the request's
 * filter applies only to matched roots, not traversed entities). Given
 * `onlyDrafts`, retain named drafts and draft links touching them without
 * expanding that set. Entities outside `ownWebIds` are marked `external`.
 */
const hashEntityReadResult = (
  response: QueryEntitySubgraphQuery,
  ownWebIds: ReadonlySet<WebId>,
  {
    onlyDrafts,
    includeArchived = false,
    properties: chosenProperties,
    fullValuesFor,
  }: {
    onlyDrafts?: ReadonlySet<EntityId>;
    includeArchived?: boolean;
    properties?: HashEntityReadInput["properties"];
    fullValuesFor?: HashEntityReadInput["fullValuesFor"];
  } = {},
): HashEntityReadResult => {
  const { subgraph, closedMultiEntityTypes, definitions, cursor } =
    deserializeQueryEntitySubgraphResponse(response.queryEntitySubgraph);
  const matched = new Set(
    getRoots(subgraph).map(({ metadata }) => metadata.recordId.editionId),
  );
  const selectedBaseUrls =
    chosenProperties === undefined
      ? undefined
      : new Set(chosenProperties.map(hashPropertyBaseUrl));

  const entities = getEntities(subgraph, false)
    .filter(
      (entity) =>
        includeArchived ||
        (entity.metadata.archived !== true &&
          entity.properties[archivedBaseUrl] !== true),
    )
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
    .map((entity) => {
      const closedType = closedTypeIn(
        closedMultiEntityTypes,
        entity.metadata.entityTypeIds,
      );
      // Label derives from the full entity before browser-side property projection.
      const label =
        closedType === undefined
          ? undefined
          : generateEntityLabel(closedType, entity);
      const projectedProperties = projectEntityProperties(
        entity.metadata.recordId.entityId,
        entity.properties,
        selectedBaseUrls,
        fullValuesFor,
      );
      return { entity, closedType, label, properties: projectedProperties };
    });

  // Key matches select candidate definitions, not ownership or applicability.
  // Preserve every returned version rather than choosing one global definition.
  const usedBaseUrls = new Set<string>();
  for (const { properties } of entities) {
    collectPropertyKeys(properties, usedBaseUrls);
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
  const resolvedTemporalAxes = subgraph.temporalAxes.resolved;

  return {
    propertyTypes,
    entityTypes: [...usedTypeIds].flatMap((entityTypeId) => {
      const title = typeTitles.get(entityTypeId);
      return title === undefined ? [] : [{ entityTypeId, title }];
    }),
    entities: entities.map(({ entity, label, properties }) => {
      const { entityId, editionId } = entity.metadata.recordId;
      const { linkData } = entity;
      const webId = extractWebIdFromEntityId(entityId);
      return {
        entityId,
        editionId,
        webId,
        ...(ownWebIds.has(webId) ? {} : { external: true as const }),
        entityTypeIds: entity.metadata.entityTypeIds,
        ...(label === undefined ? {} : { label }),
        properties,
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
      : { cursor: encodeHashEntityReadCursor(cursor, resolvedTemporalAxes) }),
  };
};

/** Runs one `queryEntitySubgraph` request as the signed-in user. */
export type QueryEntitySubgraph = (
  request: QueryEntitySubgraphRequest,
  signal: AbortSignal,
) => Promise<QueryEntitySubgraphQuery>;

const serializedPayloadBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

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
 * user to scope to, settles `{ error }`. A serialized result exceeding the
 * 12 MiB browser transport guard settles `{ refused: true, ... }`.
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
    const pageCursor =
      readInput.cursor === undefined
        ? undefined
        : decodeHashEntityReadCursor(readInput.cursor);
    if (pageCursor !== undefined && "error" in pageCursor) {
      return pageCursor;
    }
    const user = currentUser();
    const webScope = hashEntityReadWebIds(readInput, user);
    if ("error" in webScope) {
      return webScope;
    }
    const request = hashEntityReadRequest(
      readInput,
      webScope.webIds,
      pageCursor,
    );
    return settlingQueryFailure(
      signal,
      async (): Promise<HashEntityReadResult | HashEntityReadOversized> => {
        const result = hashEntityReadResult(
          await queryEntitySubgraph(request, signal),
          ownWebIdsOf(user),
          {
            onlyDrafts: hashEntityReadOnlyDrafts(readInput),
            includeArchived: readInput.includeArchived === true,
            properties: readInput.properties,
            fullValuesFor: readInput.fullValuesFor,
          },
        );
        const payloadBytes = serializedPayloadBytes(result);
        if (payloadBytes > hashEntityReadMaxPayloadBytes) {
          const matched = result.entities.filter(
            (entity) => entity.matched,
          ).length;
          return {
            refused: true as const,
            payloadBytes,
            matched,
            linked: result.entities.length - matched,
          };
        }
        return result;
      },
    );
  },
});

type QueryEntityTypesRequest = QueryEntityTypesQueryVariables["request"];

const latestTypeVersionFilter: Filter = {
  equal: [{ path: ["version"] }, { parameter: "latest" }],
};

const decodeHashEntityTypeReadCursor = (
  text: string,
): VersionedUrl | HashReadFailure => {
  if (!hashIsPublishedVersionedUrl(text)) {
    return malformedTypeCursor;
  }
  const validated = validateVersionedUrl(text);
  return validated.type === "Ok" ? validated.inner : malformedTypeCursor;
};

/** Whether this type-read input emits a `version == "latest"` filter (incompatible with cursors, H-1442). */
const typeReadUsesLatestFilter = (
  input: Pick<HashEntityTypeReadInput, "entityTypeIds" | "allVersions">,
) =>
  input.allVersions !== true &&
  (input.entityTypeIds === undefined ||
    input.entityTypeIds.some(
      (id) => hashEntityTypeSelectorKind(id) === "baseUrl",
    ));

/**
 * The `queryEntityTypes` request for one page: every given filter must match.
 * When `allVersions` is false (default), base URLs, `titles`, `webIds`, and
 * unfiltered queries apply a single `version == "latest"` filter (grouped so
 * Postgres emits the `ontology_ids` CTE at most once). When `allVersions` is
 * true or every `entityTypeId` is an exact published version, no latest filter
 * is added and cursor pagination (`after`) works natively.
 */
export const hashEntityTypeReadRequest = (
  input: Omit<HashEntityTypeReadInput, "cursor">,
  after?: VersionedUrl,
): QueryEntityTypesRequest => {
  const entityTypeIds = input.entityTypeIds;
  const allVersions = input.allVersions === true;
  let idFilters: Filter[];

  if (entityTypeIds === undefined) {
    idFilters = allVersions ? [] : [latestTypeVersionFilter];
  } else if (allVersions) {
    idFilters = anyOf(
      entityTypeIds.map((id) => ({
        equal: [{ path: [hashEntityTypeSelectorKind(id)] }, { parameter: id }],
      })),
    );
  } else {
    const baseUrls = entityTypeIds.filter(
      (id) => hashEntityTypeSelectorKind(id) === "baseUrl",
    );
    const versionedUrls = entityTypeIds.filter(
      (id) => hashEntityTypeSelectorKind(id) === "versionedUrl",
    );
    if (versionedUrls.length === 0) {
      idFilters = [
        latestTypeVersionFilter,
        ...anyOf(
          baseUrls.map((id) => ({
            equal: [{ path: ["baseUrl"] }, { parameter: id }],
          })),
        ),
      ];
    } else if (baseUrls.length === 0) {
      idFilters = anyOf(
        versionedUrls.map((id) => ({
          equal: [{ path: ["versionedUrl"] }, { parameter: id }],
        })),
      );
    } else {
      // Group all base URLs under a single `version == "latest"` branch so
      // Postgres emits the `ontology_ids` CTE once, never duplicated.
      idFilters = anyOf([
        {
          all: [
            latestTypeVersionFilter,
            ...anyOf(
              baseUrls.map((id) => ({
                equal: [{ path: ["baseUrl"] }, { parameter: id }],
              })),
            ),
          ],
        },
        ...versionedUrls.map((id) => ({
          equal: [{ path: ["versionedUrl"] }, { parameter: id }],
        })),
      ]);
    }
  }

  return {
    filter: {
      all: [
        ...idFilters,
        ...anyOf(
          (input.titles ?? []).map((title) => ({
            equal: [{ path: ["title"] }, { parameter: title }],
          })),
        ),
        ...anyOf(
          (input.webIds ?? []).map((webId) => ({
            equal: [{ path: ["webId"] }, { parameter: webId }],
          })),
        ),
      ],
    },
    // `QueryEntityTypesResponse` exposes no server-resolved `temporalAxes`, so
    // paginated type reads (`allVersions: true` or exact versioned URLs) resolve
    // live `now` per page rather than pinning a potentially skewed browser clock.
    temporalAxes: currentTimeInstantTemporalAxes,
    includeEntityTypes: "resolved",
    limit: input.limit ?? hashEntityTypeReadDefaultLimit,
    ...(after === undefined ? {} : { after }),
  };
};

/**
 * Each returned type with its properties (keyed by base URL, carrying title
 * and description/units where resolved), its links, and either `cursor` (when
 * cursor continuation is supported) or `hasMore: true` (when `version == "latest"`
 * hit `limit` and cursors are unavailable under H-1442).
 */
const hashEntityTypeReadResult = (
  response: QueryEntityTypesQuery,
  { usesLatestFilter }: { readonly usesLatestFilter: boolean },
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
          const propertyDef =
            definitions?.propertyTypes[
              "items" in value ? value.items.$ref : value.$ref
            ];
          return {
            baseUrl,
            ...(propertyDef?.title === undefined
              ? {}
              : { title: propertyDef.title }),
            ...(propertyDef?.description === undefined
              ? {}
              : { description: propertyDef.description }),
          };
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
    ...(cursor === undefined
      ? {}
      : usesLatestFilter
        ? { hasMore: true as const }
        : { cursor }),
  };
};

/** Runs one `queryEntityTypes` request as the signed-in user. */
export type QueryEntityTypes = (
  request: QueryEntityTypesRequest,
  signal: AbortSignal,
) => Promise<QueryEntityTypesQuery>;

/**
 * Brunch's HASH entity type read, run in the page. An input the agent's
 * contract doesn't allow rejects; a failed query or invalid cursor settles `{ error }`.
 */
export const createHashEntityTypeReadTool = (
  queryEntityTypes: QueryEntityTypes,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.hashQueryEntityTypes,
  inputParser: { parse: parseHashEntityTypeReadInput },
  outputParser: { parse: (value) => value },
  execute: async ({ input, signal }) => {
    const typeInput = parseHashEntityTypeReadInput(input);
    const after =
      typeInput.cursor === undefined
        ? undefined
        : decodeHashEntityTypeReadCursor(typeInput.cursor);
    if (after !== undefined && typeof after === "object" && "error" in after) {
      return after;
    }
    const usesLatestFilter = typeReadUsesLatestFilter(typeInput);
    const request = hashEntityTypeReadRequest(typeInput, after);
    return settlingQueryFailure(
      signal,
      async (): Promise<
        HashEntityTypeReadResult | HashEntityTypeReadOversized
      > => {
        const result = hashEntityTypeReadResult(
          await queryEntityTypes(request, signal),
          {
            usesLatestFilter,
          },
        );
        const payloadBytes = serializedPayloadBytes(result);
        if (payloadBytes > hashEntityReadMaxPayloadBytes) {
          return {
            refused: true as const,
            payloadBytes,
            types: result.entityTypes.length,
          };
        }
        return result;
      },
    );
  },
});

/** The signed-in user's own web, then each org web they belong to. */
const hashWebReadResult = (
  user: HashWebReadUser | undefined,
): HashWebReadResult | HashReadFailure =>
  user === undefined ? noUserSignedIn : { webs: websOf(user) };

type SummarizeEntitiesRequest = SummarizeEntitiesQueryVariables["request"];

const endpointAnchorFilter = (
  anchor: HashJoinEndpointAnchor | undefined,
): Filter[] =>
  anchor === undefined
    ? []
    : anyOf(
        anchor.entityTypes.map((type) => ({
          equal: [
            {
              path: [anchor.endpoint, "type", hashEntityTypeSelectorKind(type)],
            },
            { parameter: type },
          ],
        })),
      );

const entityCountFilter = (
  selector: HashJoinTypeSelector,
  webIds: readonly string[],
  includeArchived: boolean,
): Filter => ({
  all: [
    ...entityTypesFilter(selector.entityTypes),
    ...propertyEqualsFilter(selector.propertyEquals),
    ...endpointAnchorFilter(selector.endpointAnchor),
    ...webIdsFilter(webIds),
    ...(includeArchived ? [] : notArchivedFilters),
  ],
});

/**
 * The `summarizeEntities` request for one count: the entity read's filters
 * for types, property values and (unless `includeArchived`) not being
 * archived, limited to the webs in scope, with the total, the count per direct
 * type and its title, and the count per web.
 */
export const hashEntityCountRequest = (
  input: Omit<HashEntityCountInput, "webIds">,
  webIds: readonly string[],
): SummarizeEntitiesRequest => {
  if (webIds.length === 0) {
    throw new Error("An entity count's web scope can't be empty.");
  }
  return {
    filter: entityCountFilter(
      {
        entityTypes: input.entityTypes,
        propertyEquals: input.propertyEquals,
      },
      webIds,
      input.includeArchived === true,
    ),
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: input.includeDrafts === true,
    includeCount: true,
    includeTypeIds: true,
    includeTypeTitles: true,
    includeWebIds: true,
  };
};

/**
 * The count, each direct type counted, most first, with its title, and every
 * web in scope with its count, named where it is the user's own or one of
 * their orgs'. A response without a count fails the count.
 */
const hashEntityCountResult = (
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
      count: Object.hasOwn(webCounts, webId)
        ? (webCounts[webId as keyof typeof webCounts] ?? 0)
        : 0,
    })),
  };
};

/** Runs one `summarizeEntities` request as the signed-in user. */
export type SummarizeEntities = (
  request: SummarizeEntitiesRequest,
  signal: AbortSignal,
) => Promise<SummarizeEntitiesQuery>;

/**
 * The graph as a count by links reaches it (`runHashEntityJoinCount`):
 * resolves one server-clock `QueryTemporalAxes` snapshot via a `limit: 0`
 * subgraph probe and reuses that exact pinned snapshot across every
 * `summarizeEntities` (`size`) and `queryEntitySubgraph` (`page`) call of the
 * join, so concurrent edits between requests cannot fabricate phantom paths
 * or drift `size` against `page`. Non-id reads stay in `webScope`; grouped id
 * reads span any web and mark entities outside the user's webs `external`.
 */
const hashJoinGraph = (
  summarizeEntities: SummarizeEntities,
  queryEntitySubgraph: QueryEntitySubgraph,
  webScope: HashReadWebScope,
  user: HashWebReadUser | undefined,
  {
    includeDrafts,
    includeArchived,
  }: { readonly includeDrafts: boolean; readonly includeArchived: boolean },
): HashJoinGraph<EntityQueryCursor> => {
  const ownWebIds = ownWebIdsOf(user);
  let snapshotPromise: Promise<QueryTemporalAxes> | undefined;
  const resolveSnapshot = (signal: AbortSignal): Promise<QueryTemporalAxes> => {
    snapshotPromise ??= queryEntitySubgraph(
      {
        filter: { all: [] },
        temporalAxes: currentTimeInstantTemporalAxes,
        traversalPaths: [],
        includeDrafts: false,
        includePermissions: false,
        limit: 0,
      },
      signal,
    ).then(
      (response) =>
        deserializeQueryEntitySubgraphResponse(response.queryEntitySubgraph)
          .subgraph.temporalAxes.resolved,
    );
    return snapshotPromise;
  };
  return {
    size: async (selector, signal) => {
      if (webScope.webIds.length === 0) {
        throw new Error("An entity count's web scope can't be empty.");
      }
      const temporalAxes = await resolveSnapshot(signal);
      const response = await summarizeEntities(
        {
          filter: entityCountFilter(selector, webScope.webIds, includeArchived),
          temporalAxes,
          includeDrafts,
          includeCount: true,
        },
        signal,
      );
      const { count } = response.summarizeEntities;
      if (count === undefined) {
        throw new Error("HASH's graph returned a summary without a count.");
      }
      return count;
    },
    page: async (selector, limit, cursor, signal) => {
      const temporalAxes = await resolveSnapshot(signal);
      // For grouped entity ID lookups, `linkData` already carries the exact
      // target `entityId` (live or draft), so always match that exact edition
      // rather than fetching unrelated draft editions of live entities.
      const filter: Filter =
        "entityIds" in selector
          ? {
              all: [
                ...anyOf(
                  selector.entityIds.map((id) =>
                    generateEntityEditionFilter(id as EntityId),
                  ),
                ),
                ...(includeArchived ? [] : notArchivedFilters),
              ],
            }
          : entityCountFilter(selector, webScope.webIds, includeArchived);
      const request: QueryEntitySubgraphRequest = {
        filter,
        temporalAxes,
        traversalPaths: [],
        includeDrafts,
        includePermissions: false,
        includeEntityTypes: "resolved",
        limit,
        ...(cursor === undefined ? {} : { cursor }),
      };

      const {
        subgraph,
        closedMultiEntityTypes,
        cursor: nextCursor,
      } = deserializeQueryEntitySubgraphResponse(
        (await queryEntitySubgraph(request, signal)).queryEntitySubgraph,
      );
      const entities: HashJoinEntity[] = getEntities(subgraph, false)
        .filter(
          (entity) =>
            includeArchived ||
            (entity.metadata.archived !== true &&
              entity.properties[archivedBaseUrl] !== true),
        )
        .map((entity) => {
          const { entityId } = entity.metadata.recordId;
          const webId = extractWebIdFromEntityId(entityId);
          const closedType = closedTypeIn(
            closedMultiEntityTypes,
            entity.metadata.entityTypeIds,
          );
          const rawLabel =
            closedType === undefined
              ? undefined
              : generateEntityLabel(closedType, entity);
          // Join counts always clip display labels at `hashReadLabelPreviewLength`
          // server-side; keeping one extra character preserves `isLongLabel`
          // detection while keeping up to 500 grouped labels well under 12 MiB.
          const label =
            rawLabel === undefined
              ? undefined
              : rawLabel.length > hashReadLabelPreviewLength + 1
                ? rawLabel.slice(0, hashReadLabelPreviewLength + 1)
                : rawLabel;
          const { linkData } = entity;
          return {
            entityId,
            ...(label === undefined ? {} : { label }),
            ...(ownWebIds.has(webId) ? {} : { external: true as const }),
            ...(linkData === undefined
              ? {}
              : {
                  linkData: {
                    leftEntityId: linkData.leftEntityId,
                    rightEntityId: linkData.rightEntityId,
                  },
                }),
          };
        });
      return {
        entities,
        ...(nextCursor === undefined || nextCursor === null
          ? {}
          : { cursor: nextCursor }),
      };
    },
  };
};

const guardCountPayload = <Result>(
  result: Result,
): Result | HashReadFailure => {
  const payloadBytes = serializedPayloadBytes(result);
  return payloadBytes > hashEntityReadMaxPayloadBytes
    ? {
        error: `This count's raw payload (${(payloadBytes / 1_000_000).toFixed(1)} MB) exceeded the ${(hashEntityReadMaxPayloadBytes / 1_000_000).toFixed(1)} MB browser-to-agent transport limit; narrow by entityTypes, webIds, or propertyEquals.`,
      }
    : result;
};

/**
 * Brunch's HASH entity count, run in the page: one `summarizeEntities`
 * request over the webs in scope, or with `where` or `groupBy` a count by
 * links (`runHashEntityJoinCount`), read page by page in the same webs and
 * joined here. An input the agent's contract doesn't allow rejects; a failed
 * query, an oversized wire payload, or no user to scope to, settles `{ error }`.
 */
export const createHashEntityCountTool = (
  summarizeEntities: SummarizeEntities,
  currentUser: () => HashWebReadUser | undefined,
  queryEntitySubgraph: QueryEntitySubgraph,
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
    if (countInput.where !== undefined || countInput.groupBy !== undefined) {
      return settlingQueryFailure(signal, async () =>
        guardCountPayload(
          await runHashEntityJoinCount(
            countInput,
            webScope.scope,
            hashJoinGraph(
              summarizeEntities,
              queryEntitySubgraph,
              webScope,
              user,
              {
                includeDrafts: countInput.includeDrafts === true,
                includeArchived: countInput.includeArchived === true,
              },
            ),
            signal,
          ),
        ),
      );
    }
    const request = hashEntityCountRequest(countInput, webScope.webIds);
    return settlingQueryFailure(signal, async () =>
      guardCountPayload(
        hashEntityCountResult(
          await summarizeEntities(request, signal),
          webScope,
          user,
        ),
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
    return useMemo(() => {
      const queryEntitySubgraph: QueryEntitySubgraph = async (
        request,
        signal,
      ) =>
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
        ).data;
      return [
        createHashEntityReadTool(queryEntitySubgraph, () => userRef.current),
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
          queryEntitySubgraph,
        ),
      ];
    }, [apolloClient]);
  };
