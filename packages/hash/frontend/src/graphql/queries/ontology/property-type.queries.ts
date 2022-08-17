import { gql } from "@apollo/client";

export const getPropertyType = gql`
  query getPropertyType($propertyTypeVersionedUri: String!) {
    getPropertyType(propertyTypeVersionedUri: $propertyTypeVersionedUri) {
      propertyTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const getAllLatestPropertyTypes = gql`
  query getAllLatestPropertyTypes {
    getAllLatestPropertyTypes {
      propertyTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const createPropertyType = gql`
  mutation createPropertyType($accountId: ID!, $propertyType: PropertyType!) {
    createPropertyType(accountId: $accountId, propertyType: $propertyType) {
      propertyTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const updatePropertyType = gql`
  mutation updatePropertyType(
    $accountId: ID!
    $propertyTypeVersionedUri: String!
    $updatedPropertyType: PropertyType!
  ) {
    updatePropertyType(
      accountId: $accountId
      propertyTypeVersionedUri: $propertyTypeVersionedUri
      updatedPropertyType: $updatedPropertyType
    ) {
      propertyTypeVersionedUri
      createdBy
      schema
    }
  }
`;
