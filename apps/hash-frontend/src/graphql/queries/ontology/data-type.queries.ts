import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const getDataTypeQuery = gql`
  query getDataType(
    $dataTypeId: VersionedUrl!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $includeArchived: Boolean = false
  ) {
    getDataType(
      dataTypeId: $dataTypeId
      constrainsValuesOn: $constrainsValuesOn
      includeArchived: $includeArchived
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const queryDataTypesQuery = gql`
  query queryDataTypes(
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $includeArchived: Boolean = false
  ) {
    queryDataTypes(
      constrainsValuesOn: $constrainsValuesOn
      includeArchived: $includeArchived
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;
