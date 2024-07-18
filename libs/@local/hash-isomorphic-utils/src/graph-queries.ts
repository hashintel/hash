import type { GraphResolveDepths } from "@blockprotocol/graph";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  DataTypeQueryToken,
  EntityQueryToken,
  EntityTypeQueryToken,
  Filter,
  PropertyTypeQueryToken,
  Selector,
} from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  EntityRelationAndSubject,
  EntityTypeRelationAndSubject,
  PropertyTypeRelationAndSubject,
  QueryTemporalAxesUnresolved,
  SubgraphRootType,
} from "@local/hash-subgraph";
import { splitEntityId } from "@local/hash-subgraph";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";

import type { SubgraphFieldsFragment } from "./graphql/api-types.gen";
import { systemPropertyTypes } from "./ontology-type-ids";

export const zeroedGraphResolveDepths: GraphResolveDepths = {
  inheritsFrom: { outgoing: 0 },
  constrainsValuesOn: { outgoing: 0 },
  constrainsPropertiesOn: { outgoing: 0 },
  constrainsLinksOn: { outgoing: 0 },
  constrainsLinkDestinationsOn: { outgoing: 0 },
  isOfType: { outgoing: 0 },
  hasLeftEntity: { incoming: 0, outgoing: 0 },
  hasRightEntity: { incoming: 0, outgoing: 0 },
};

export const fullOntologyResolveDepths: Omit<
  GraphResolveDepths,
  "hasLeftEntity" | "hasRightEntity"
> = {
  constrainsValuesOn: { outgoing: 255 },
  constrainsPropertiesOn: { outgoing: 255 },
  constrainsLinksOn: { outgoing: 1 },
  constrainsLinkDestinationsOn: { outgoing: 1 },
  inheritsFrom: { outgoing: 255 },
  isOfType: { outgoing: 1 },
};

/**
 * Slices the datastore across this instant of time.
 *
 * Used to be passed as `temporalAxes` to structural queries.
 */
export const currentTimeInstantTemporalAxes: QueryTemporalAxesUnresolved = {
  pinned: {
    axis: "transactionTime",
    timestamp: null,
  },
  variable: {
    axis: "decisionTime",
    interval: {
      start: null,
      end: null,
    },
  },
};

export const generateTimeInstantTemporalAxes = (
  isoTimestamp: Timestamp,
): QueryTemporalAxesUnresolved => ({
  pinned: {
    axis: "transactionTime",
    timestamp: null,
  },
  variable: {
    axis: "decisionTime",
    interval: {
      start: {
        kind: "inclusive",
        limit: isoTimestamp,
      },
      end: {
        kind: "inclusive",
        limit: isoTimestamp,
      },
    },
  },
});

/**
 * According to the database's most up-to-date knowledge (transaction time),
 * return the full history of entities and the times at which those decisions
 * were made.
 *
 * Used to be passed as `temporalAxes` to structural queries.
 */
export const fullDecisionTimeAxis: QueryTemporalAxesUnresolved = {
  pinned: {
    axis: "transactionTime",
    timestamp: null,
  },
  variable: {
    axis: "decisionTime",
    interval: {
      start: {
        kind: "unbounded",
      },
      end: null,
    },
  },
};

/**
 * Return the full history of records according to their transaction time
 *
 * This is specifically useful for:
 * 1. Returning archived types – types currently are archived by setting an upper bound on their transaction time
 * 2. [Future] audit purposes, to check the transaction history of records
 */
export const fullTransactionTimeAxis: QueryTemporalAxesUnresolved = {
  pinned: {
    axis: "decisionTime",
    timestamp: null,
  },
  variable: {
    axis: "transactionTime",
    interval: {
      start: {
        kind: "unbounded",
      },
      end: null,
    },
  },
};

/**
 * Generates a query filter to match a type, given its versionedUrl.
 *
 * @param versionedUrl
 * @param [options] configuration of the returned filter
 * @param [options.ignoreParents] don't check the type's parents for a match against the versionedUrl
 * @param [options.pathPrefix] the path to the thing to match the type of, if it's not the root of the query
 *     @example ["outgoingLinks", "rightEntity"] to filter query results to things with a linked entity of the given
 *   type
 */
export const generateVersionedUrlMatchingFilter = (
  versionedUrl: VersionedUrl,
  options?: {
    ignoreParents?: boolean;
    pathPrefix?: (
      | DataTypeQueryToken
      | EntityQueryToken
      | EntityTypeQueryToken
      | PropertyTypeQueryToken
      | Selector
    )[];
  },
): Filter => {
  const { ignoreParents = false, pathPrefix = [] } = options ?? {};

  const { baseUrl, version } = componentsFromVersionedUrl(versionedUrl);

  const basePath = [
    ...pathPrefix,
    ignoreParents ? "type(inheritanceDepth = 0)" : "type",
  ];

  return {
    all: [
      {
        equal: [{ path: [...basePath, "baseUrl"] }, { parameter: baseUrl }],
      },
      {
        equal: [{ path: [...basePath, "version"] }, { parameter: version }],
      },
    ],
  };
};

/**
 * Generate a filter to match an entity by its ID.
 *
 * If the entityId includes a draftId, only that draft will be queried.
 * Pass includeArchived: true to include archived entities in the query.
 *
 * N.B. Some entities (notifications, pages, quick notes) handle archived via a property type instead of a boolean.
 * You must additionally use {@link pageOrNotificationNotArchivedFilter} to exclude entities of those types where the property is falsy:
 * {
 *   all: [generateEntityIdFilter({ entityId }), notArchivedFilter]
 * }
 */
export const generateEntityIdFilter = ({
  entityId,
  includeArchived = false,
}: {
  entityId: EntityId;
  includeArchived: boolean;
}): Filter => {
  const [ownedById, entityUuid, draftId] = splitEntityId(entityId);

  const conditions: Filter[] = [
    {
      equal: [
        { path: ["uuid"] },
        {
          parameter: entityUuid,
        },
      ],
    },
    {
      equal: [
        { path: ["ownedById"] },
        {
          parameter: ownedById,
        },
      ],
    },
  ];

  if (draftId) {
    conditions.push({
      equal: [
        { path: ["draftId"] },
        {
          parameter: draftId,
        },
      ],
    });
  }

  if (!includeArchived) {
    conditions.push({ equal: [{ path: ["archived"] }, { parameter: false }] });
  }

  return { all: conditions };
};

const archivedBaseUrl = systemPropertyTypes.archived.propertyTypeBaseUrl;
/**
 * A filter for entities which record 'archived' state as a property rather than via an 'archived' boolean
 * @todo H-611 implement entity archival properly via temporal versioning, and migrate these other approaches
 */
export const pageOrNotificationNotArchivedFilter: Filter = {
  any: [
    {
      equal: [
        {
          path: ["properties", archivedBaseUrl],
        },
        // @ts-expect-error -- We will update the type definition of `EntityStructuralQuery` to allow this, see H-1207
        null,
      ],
    },
    {
      equal: [
        {
          path: ["properties", archivedBaseUrl],
        },
        { parameter: false },
      ],
    },
  ],
};
export const mapGqlSubgraphFieldsFragmentToSubgraph = <
  RootType extends SubgraphRootType,
>(
  subgraph: SubgraphFieldsFragment,
) => deserializeSubgraph<RootType>(subgraph);

export const createDefaultAuthorizationRelationships = (params: {
  actorId: AccountId;
}): EntityRelationAndSubject[] => [
  {
    relation: "administrator",
    subject: {
      kind: "account",
      subjectId: params.actorId,
    },
  },
  {
    relation: "setting",
    subject: {
      kind: "setting",
      subjectId: "administratorFromWeb",
    },
  },
  {
    relation: "setting",
    subject: {
      kind: "setting",
      subjectId: "updateFromWeb",
    },
  },
  {
    relation: "setting",
    subject: {
      kind: "setting",
      subjectId: "viewFromWeb",
    },
  },
];

export const createOrgMembershipAuthorizationRelationships = ({
  memberAccountId,
}: {
  memberAccountId: AccountId;
}): EntityRelationAndSubject[] => [
  {
    relation: "setting",
    subject: {
      kind: "setting",
      subjectId: "administratorFromWeb", // web admins can edit the link
    },
  },
  {
    relation: "editor",
    subject: {
      kind: "account",
      subjectId: memberAccountId, // so can the user
    },
  },
  {
    relation: "viewer",
    subject: {
      kind: "public", // everyone in the world can see it (until we allow restricting this)
    },
  },
];

export const defaultPropertyTypeAuthorizationRelationships: PropertyTypeRelationAndSubject[] =
  [
    {
      relation: "setting",
      subject: {
        kind: "setting",
        subjectId: "updateFromWeb",
      },
    },
    {
      relation: "viewer",
      subject: {
        kind: "public",
      },
    },
  ];

export const defaultEntityTypeAuthorizationRelationships: EntityTypeRelationAndSubject[] =
  [
    {
      relation: "setting",
      subject: {
        kind: "setting",
        subjectId: "updateFromWeb",
      },
    },
    {
      relation: "viewer",
      subject: {
        kind: "public",
      },
    },
    {
      relation: "instantiator",
      subject: {
        kind: "public",
      },
    },
  ];
