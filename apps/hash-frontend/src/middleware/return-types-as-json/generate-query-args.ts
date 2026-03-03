import type { VersionedUrl } from "@blockprotocol/type-system";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";
import type { DocumentNode } from "graphql";

import type {
  QueryDataTypesQueryVariables,
  QueryEntityTypesQueryVariables,
  QueryPropertyTypesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";
import { queryEntityTypesQuery } from "../../graphql/queries/ontology/entity-type.queries";
import { queryPropertyTypesQuery } from "../../graphql/queries/ontology/property-type.queries";

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
    | QueryDataTypesQueryVariables
    | QueryEntityTypesQueryVariables
    | QueryPropertyTypesQueryVariables;
} => {
  switch (ontologyType) {
    case "data-type":
      return {
        query: queryStringFromNode(queryDataTypesQuery),
        variables: {
          request: {
            filter: {
              equal: [{ path: ["versionedUrl"] }, { parameter: versionedUrl }],
            },
            temporalAxes: fullTransactionTimeAxis,
          },
        },
      };
    case "entity-type":
      return {
        query: queryStringFromNode(queryEntityTypesQuery),
        variables: {
          request: {
            filter: {
              equal: [{ path: ["versionedUrl"] }, { parameter: versionedUrl }],
            },
            temporalAxes: fullTransactionTimeAxis,
          },
        },
      };
    case "property-type":
      return {
        query: queryStringFromNode(queryPropertyTypesQuery),
        variables: {
          request: {
            filter: {
              equal: [{ path: ["versionedUrl"] }, { parameter: versionedUrl }],
            },
            temporalAxes: fullTransactionTimeAxis,
          },
        },
      };
  }
};
