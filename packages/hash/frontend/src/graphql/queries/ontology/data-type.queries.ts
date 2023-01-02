import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "../subgraph";

export const getDataTypeQuery = gql`
  query getDataType(
    $dataTypeId: VersionedUri!
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

export const getAllLatestDataTypesQuery = gql`
  query getAllLatestDataTypes(
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
  ) {
    getAllLatestDataTypes(constrainsValuesOn: $constrainsValuesOn) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;
