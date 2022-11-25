import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const getDataTypeQuery = gql`
  query getDataType($dataTypeId: VersionedUri!, $dataTypeResolveDepth: Int!) {
    getDataType(
      dataTypeId: $dataTypeId
      dataTypeResolveDepth: $dataTypeResolveDepth
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getAllLatestDataTypesQuery = gql`
  query getAllLatestDataTypes($dataTypeResolveDepth: Int!) {
    getAllLatestDataTypes(dataTypeResolveDepth: $dataTypeResolveDepth) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;
