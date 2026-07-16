import { splitEntityId } from "@blockprotocol/type-system";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";

import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "./ontology-type-ids.js";

import type { SubgraphFieldsFragment } from "./graphql/api-types.gen.js";
import type {
  EntityRootType,
  QueryTemporalAxesUnresolved,
  SubgraphRootType,
} from "@blockprotocol/graph";
import type { EntityId, Timestamp } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { GraphResolveDepths } from "@rust/hash-graph-store/types";

/**
 * Ontology resolve depths that traverse most relationships fully, except for link constraints.
 *
 * Follows the complete chain of:
 * - Data type constraints (`constrainsValuesOn`)
 * - Property type constraints (`constrainsPropertiesOn`)
 * - Inheritance hierarchies (`inheritsFrom`)
 * - Entity type definitions (`isOfType`)
 *
 * But only resolves one level deep for:
 * - Link type constraints (`constrainsLinksOn`)
 * - Link destination constraints (`constrainsLinkDestinationsOn`)
 *
 * This is "almost full" because nested link constraints (links that constrain other links,
 * or link destinations with their own link destinations) won't be fully traversed.
 */
export const almostFullOntologyResolveDepths: GraphResolveDepths = {
  constrainsValuesOn: 255,
  constrainsPropertiesOn: 255,
  constrainsLinksOn: 1,
  constrainsLinkDestinationsOn: 1,
  inheritsFrom: 255,
  isOfType: true,
};

export const zeroedOntologyResolveDepths: GraphResolveDepths = {
  constrainsValuesOn: 0,
  constrainsPropertiesOn: 0,
  constrainsLinksOn: 0,
  constrainsLinkDestinationsOn: 0,
  inheritsFrom: 0,
  isOfType: false,
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
      not: {
        exists: {
          path: ["properties", archivedBaseUrl],
        },
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
  systemEntityTypes.notification.entityTypeBaseUrl,
];

export const usageRecordTypesToIgnore = [
  systemEntityTypes.usageRecord.entityTypeBaseUrl,
  systemLinkEntityTypes.recordsUsageOf.linkEntityTypeBaseUrl,
  systemLinkEntityTypes.created.linkEntityTypeBaseUrl,
  systemLinkEntityTypes.updated.linkEntityTypeBaseUrl,
  systemLinkEntityTypes.incurredIn.linkEntityTypeBaseUrl,
];

const pageTypesToIgnore = [
  systemLinkEntityTypes.occurredInEntity.linkEntityTypeBaseUrl,
];

export const noisySystemBaseUrls = [
  ...notificationTypesToIgnore,
  ...usageRecordTypesToIgnore,
  ...pageTypesToIgnore,
  systemEntityTypes.user.entityTypeBaseUrl,
  systemEntityTypes.dashboard.entityTypeBaseUrl,
  systemEntityTypes.dashboardItem.entityTypeBaseUrl,
  systemEntityTypes.machine.entityTypeBaseUrl,
  systemEntityTypes.organization.entityTypeBaseUrl,
  systemLinkEntityTypes.isMemberOf.linkEntityTypeBaseUrl,
] as const;

export type NoisySystemTypeBaseUrl = (typeof noisySystemBaseUrls)[number];

export const ignoreNoisySystemTypesFilter: Filter = {
  all: noisySystemBaseUrls.map((baseUrl) => ({
    notEqual: [{ path: ["type", "baseUrl"] }, { parameter: baseUrl }],
  })),
};
