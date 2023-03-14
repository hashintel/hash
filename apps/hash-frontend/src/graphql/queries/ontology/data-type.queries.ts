import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "../subgraph";

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
