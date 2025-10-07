import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { DocumentNode } from "graphql";

import type {
  QueryDataTypeSubgraphQueryVariables,
  QueryEntityTypeSubgraphQueryVariables,
  QueryPropertyTypeSubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypeSubgraphQuery } from "../../graphql/queries/ontology/data-type.queries";
import { queryEntityTypeSubgraphQuery } from "../../graphql/queries/ontology/entity-type.queries";
import { queryPropertyTypeSubgraphQuery } from "../../graphql/queries/ontology/property-type.queries";

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

type OntologyType = "data-type" | "entity-type" | "property-type";

export const generateQueryArgs = (
  versionedUrl: VersionedUrl,
  ontologyType: OntologyType,
): {
  query: string;
  variables:
    | QueryDataTypeSubgraphQueryVariables
    | QueryEntityTypeSubgraphQueryVariables
    | QueryPropertyTypeSubgraphQueryVariables;
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
        query: queryStringFromNode(queryEntityTypeSubgraphQuery),
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
    case "property-type":
      return {
        query: queryStringFromNode(queryPropertyTypeSubgraphQuery),
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
  }
};
