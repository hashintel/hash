import { gql } from "@apollo/client";

export const getDataTypeQuery = gql`
  query getDataType($dataTypeId: String!) {
    getDataType(dataTypeId: $dataTypeId) {
      dataTypeId
      ownedById
      dataType
    }
  }
`;

export const getAllLatestDataTypesQuery = gql`
  query getAllLatestDataTypes {
    getAllLatestDataTypes {
      dataTypeId
      ownedById
      dataType
    }
  }
`;
