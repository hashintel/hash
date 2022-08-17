import { gql } from "@apollo/client";

export const getDataType = gql`
  query getDataType($dataTypeVersionedUri: String!) {
    getDataType(dataTypeVersionedUri: $dataTypeVersionedUri) {
      dataTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const getAllLatestDataTypes = gql`
  query getAllLatestDataTypes {
    getAllLatestDataTypes {
      dataTypeVersionedUri
      createdBy
      schema
    }
  }
`;
