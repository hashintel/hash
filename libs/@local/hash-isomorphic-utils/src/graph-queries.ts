import { GraphResolveDepths } from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system";
import {
  DataTypeQueryToken,
  EntityQueryToken,
  EntityTypeQueryToken,
  Filter,
  PropertyTypeQueryToken,
  Selector,
} from "@local/hash-graph-client";
import {
  AccountId,
  EntityRelationAndSubject,
  QueryTemporalAxesUnresolved,
  Subgraph,
  SubgraphRootType,
  Timestamp,
} from "@local/hash-subgraph";
import {
  componentsFromVersionedUrl,
  extractBaseUrl,
} from "@local/hash-subgraph/type-system-patch";

import { SubgraphFieldsFragment } from "./graphql/api-types.gen";
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
 * Generates a query filter to match a type, given its versionedUrl.
 *
 * @param versionedUrl
 * @param [options] configuration of the returned filter
 * @param [options.ignoreParents] don't check the type's parents for a match against the versionedUrl
 * @param [options.pathPrefix] the path to the thing to match the type of, if it's not the root of the query
 *     @example ["outgoingLinks", "rightEntity"] to filter query results to things with a linked entity of the given type
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

const archivedBaseUrl = extractBaseUrl(
  systemPropertyTypes.archived.propertyTypeId,
);

export const notArchivedFilter: Filter = {
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
) => subgraph as Subgraph<RootType>;

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
