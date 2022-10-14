import { gql } from "@apollo/client";

export const getDataTypeQuery = gql`
  query getDataType($dataTypeId: String!) {
    getDataType(dataTypeId: $dataTypeId) {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth(depth: 0)
        propertyTypeResolveDepth(depth: 0)
        linkTypeResolveDepth(depth: 0)
        entityTypeResolveDepth(depth: 0)
        entityResolveDepth(depth: 0)
        linkResolveDepth(depth: 0)
      }
    }
  }
`;

export const getAllLatestDataTypesQuery = gql`
  query getAllLatestDataTypes {
    getAllLatestDataTypes {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth(depth: 0)
        propertyTypeResolveDepth(depth: 0)
        linkTypeResolveDepth(depth: 0)
        entityTypeResolveDepth(depth: 0)
        entityResolveDepth(depth: 0)
        linkResolveDepth(depth: 0)
      }
    }
  }
`;
