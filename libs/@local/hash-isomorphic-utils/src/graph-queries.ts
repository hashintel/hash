import type {
  EntityRootType,
  GraphResolveDepths,
  QueryTemporalAxesUnresolved,
  SubgraphRootType,
} from "@blockprotocol/graph";
import type {
  EntityId,
  Timestamp,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  componentsFromVersionedUrl,
  splitEntityId,
} from "@blockprotocol/type-system";
import type {
  DataTypeQueryToken,
  EntityQueryToken,
  EntityTypeQueryToken,
  Filter,
  PropertyTypeQueryToken,
  Selector,
} from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";

import type { SubgraphFieldsFragment } from "./graphql/api-types.gen.js";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "./ontology-type-ids.js";

export const zeroedGraphResolveDepths: GraphResolveDepths = {
  inheritsFrom: { outgoing: 0 },
  constrainsValuesOn: { outgoing: 0 },
  constrainsPropertiesOn: { outgoing: 0 },
  constrainsLinksOn: { outgoing: 0 },
  constrainsLinkDestinationsOn: { outgoing: 0 },
  isOfType: { outgoing: 0 },
};

export const fullGraphResolveDepths: GraphResolveDepths = {
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
 * @param [options.forEntityType] if this filter is targeting Entity Type roots rather than Entity roots
 * @param [options.ignoreParents] don't check the type's parents for a match against the versionedUrl
 * @param [options.pathPrefix] the path to the thing to match the type of, if it's not the root of the query
 *     @example ["outgoingLinks", "rightEntity"] to filter query results to things with a linked entity of the given
 *   type
 */
export const generateVersionedUrlMatchingFilter = (
  versionedUrl: VersionedUrl,
  options?: {
    forEntityType?: boolean;
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
  const {
    forEntityType,
    ignoreParents = false,
    pathPrefix = [],
  } = options ?? {};

  const { baseUrl, version } = componentsFromVersionedUrl(versionedUrl);

  const basePath: string[] = pathPrefix;

  if (!forEntityType) {
    basePath.push(ignoreParents ? "type(inheritanceDepth = 0)" : "type");
  }

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
  const [webId, entityUuid, draftId] = splitEntityId(entityId);

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
        { path: ["webId"] },
        {
          parameter: webId,
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
      exists: {
        path: ["properties", archivedBaseUrl],
      },
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
  RootType extends
    | Exclude<SubgraphRootType, EntityRootType>
    | EntityRootType<HashEntity>,
>(
  subgraph: SubgraphFieldsFragment,
) => deserializeSubgraph<RootType>(subgraph);

export const notificationTypesToIgnore = [
  systemEntityTypes.notification.entityTypeId,
];

export const usageRecordTypesToIgnore = [
  systemEntityTypes.usageRecord.entityTypeId,
  systemLinkEntityTypes.recordsUsageOf.linkEntityTypeId,
  systemLinkEntityTypes.created.linkEntityTypeId,
  systemLinkEntityTypes.updated.linkEntityTypeId,
  systemLinkEntityTypes.incurredIn.linkEntityTypeId,
];

const pageTypesToIgnore = [
  systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
];

export const noisySystemTypeIds = [
  ...notificationTypesToIgnore,
  ...usageRecordTypesToIgnore,
  ...pageTypesToIgnore,
] as const;

export type NoisySystemTypeId = (typeof noisySystemTypeIds)[number];

export const ignoreNoisySystemTypesFilter: Filter = {
  all: noisySystemTypeIds.map((versionedUrl) => ({
    notEqual: [{ path: ["type", "versionedUrl"] }, { parameter: versionedUrl }],
  })),
};
