import { gql } from "@apollo/client";

export const getDataTypeQuery = gql`
  query getDataType($dataTypeVersionedUri: String!) {
    getDataType(dataTypeVersionedUri: $dataTypeVersionedUri) {
      dataTypeVersionedUri
      accountId
      dataType
    }
  }
`;

export const getAllLatestDataTypesQuery = gql`
  query getAllLatestDataTypes {
    getAllLatestDataTypes {
      dataTypeVersionedUri
      accountId
      dataType
    }
  }
`;
