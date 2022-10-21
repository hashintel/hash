import { gql } from "@apollo/client";

export const getDataTypeQuery = gql`
  query getDataType($dataTypeId: String!, $dataTypeResolveDepth: Int!) {
    getDataType(
      dataTypeId: $dataTypeId
      dataTypeResolveDepth: $dataTypeResolveDepth
    ) {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth
        propertyTypeResolveDepth
        linkTypeResolveDepth
        entityTypeResolveDepth
        linkTargetEntityResolveDepth
        linkResolveDepth
      }
    }
  }
`;

export const getAllLatestDataTypesQuery = gql`
  query getAllLatestDataTypes($dataTypeResolveDepth: Int!) {
    getAllLatestDataTypes(dataTypeResolveDepth: $dataTypeResolveDepth) {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth
        propertyTypeResolveDepth
        linkTypeResolveDepth
        entityTypeResolveDepth
        linkTargetEntityResolveDepth
        linkResolveDepth
      }
    }
  }
`;
