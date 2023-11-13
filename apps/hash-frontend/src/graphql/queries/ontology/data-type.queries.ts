import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const getDataTypeQuery = gql`
  query getDataType(
    $dataTypeId: VersionedUrl!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
  ) {
    getDataType(
      dataTypeId: $dataTypeId
      constrainsValuesOn: $constrainsValuesOn
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const queryDataTypesQuery = gql`
  query queryDataTypes($constrainsValuesOn: OutgoingEdgeResolveDepthInput!) {
    queryDataTypes(constrainsValuesOn: $constrainsValuesOn) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;
