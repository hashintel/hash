import { VersionedUri } from "@blockprotocol/type-system";
import { DocumentNode } from "graphql";

import {
  GetDataTypeQueryVariables,
  GetEntityTypeQueryVariables,
  GetPropertyTypeQueryVariables,
} from "../../graphql/api-types.gen";
import { getDataTypeQuery } from "../../graphql/queries/ontology/data-type.queries";
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
  versionedUri: VersionedUri,
  ontologyType: OntologyType,
): {
  query: string;
  variables:
    | GetDataTypeQueryVariables
    | GetEntityTypeQueryVariables
    | GetPropertyTypeQueryVariables;
} => {
  switch (ontologyType) {
    case "data-type":
      return {
        query: queryStringFromNode(getDataTypeQuery),
        variables: {
          dataTypeId: versionedUri,
          constrainsValuesOn: zeroDepth,
        },
      };
    case "entity-type":
      return {
        query: queryStringFromNode(getEntityTypeQuery),
        variables: {
          entityTypeId: versionedUri,
          constrainsLinkDestinationsOn: zeroDepth,
          constrainsLinksOn: zeroDepth,
          constrainsPropertiesOn: zeroDepth,
          constrainsValuesOn: zeroDepth,
        },
      };
    case "property-type":
      return {
        query: queryStringFromNode(getPropertyTypeQuery),
        variables: {
          constrainsValuesOn: zeroDepth,
          constrainsPropertiesOn: zeroDepth,
          propertyTypeId: versionedUri,
        },
      };
  }
};
