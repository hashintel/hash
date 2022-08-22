import { gql } from "@apollo/client";

export const getPropertyTypeQuery = gql`
  query getPropertyType($propertyTypeVersionedUri: String!) {
    getPropertyType(propertyTypeVersionedUri: $propertyTypeVersionedUri) {
      propertyTypeVersionedUri
      accountId
      propertyType
    }
  }
`;

export const getAllLatestPropertyTypesQuery = gql`
  query getAllLatestPropertyTypes {
    getAllLatestPropertyTypes {
      propertyTypeVersionedUri
      accountId
      propertyType
    }
  }
`;

export const createPropertyTypeMutation = gql`
  mutation createPropertyType($accountId: ID!, $propertyType: PropertyType!) {
    createPropertyType(accountId: $accountId, propertyType: $propertyType) {
      propertyTypeVersionedUri
      accountId
      propertyType
    }
  }
`;

export const updatePropertyTypeMutation = gql`
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
      accountId
      propertyType
    }
  }
`;
