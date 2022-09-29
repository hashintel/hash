import { gql } from "@apollo/client";

export const getDataTypeQuery = gql`
  query getDataType($dataTypeVersionedUri: String!) {
    getDataType(dataTypeVersionedUri: $dataTypeVersionedUri) {
      dataTypeVersionedUri
      ownedById
      dataType
    }
  }
`;

export const getAllLatestDataTypesQuery = gql`
  query getAllLatestDataTypes {
    getAllLatestDataTypes {
      dataTypeVersionedUri
      ownedById
      dataType
    }
  }
`;
