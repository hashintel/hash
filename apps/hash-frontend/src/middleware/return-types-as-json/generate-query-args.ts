import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { DocumentNode } from "graphql";

import type {
  GetEntityTypeQueryVariables,
  GetPropertyTypeQueryVariables,
  QueryDataTypeSubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypeSubgraphQuery } from "../../graphql/queries/ontology/data-type.queries";
import { getEntityTypeQuery } from "../../graphql/queries/ontology/entity-type.queries";
import { getPropertyTypeQuery } from "../../graphql/queries/ontology/property-type.queries";

/**
 * Return the internal query string from a gql-tagged query, i.e. gql`string` -> string
 */
const queryStringFromNode = (node: DocumentNode) => {
  const string = node.loc?.source.body.toString();

  if (!string) {
    throw new Error("Node did not contain 'loc'");
  }

  return string;
};

const zeroDepth = { outgoing: 0 };

type OntologyType = "data-type" | "entity-type" | "property-type";

export const generateQueryArgs = (
  versionedUrl: VersionedUrl,
  ontologyType: OntologyType,
): {
  query: string;
  variables:
    | QueryDataTypeSubgraphQueryVariables
    | GetEntityTypeQueryVariables
    | GetPropertyTypeQueryVariables;
} => {
  switch (ontologyType) {
    case "data-type":
      return {
        query: queryStringFromNode(queryDataTypeSubgraphQuery),
        variables: {
          request: {
            filter: {
              equal: [{ path: ["versionedUrl"] }, { parameter: versionedUrl }],
            },
            graphResolveDepths: zeroedGraphResolveDepths,
            temporalAxes: fullTransactionTimeAxis,
          },
        },
      };
    case "entity-type":
      return {
        query: queryStringFromNode(getEntityTypeQuery),
        variables: {
          entityTypeId: versionedUrl,
          constrainsLinkDestinationsOn: zeroDepth,
          constrainsLinksOn: zeroDepth,
          constrainsPropertiesOn: zeroDepth,
          constrainsValuesOn: zeroDepth,
          inheritsFrom: zeroDepth,
          includeArchived: true,
        },
      };
    case "property-type":
      return {
        query: queryStringFromNode(getPropertyTypeQuery),
        variables: {
          constrainsValuesOn: zeroDepth,
          constrainsPropertiesOn: zeroDepth,
          propertyTypeId: versionedUrl,
          includeArchived: true,
        },
      };
  }
};
