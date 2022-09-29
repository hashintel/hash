import { gql } from "@apollo/client";

export const getPropertyTypeQuery = gql`
  query getPropertyType($propertyTypeVersionedUri: String!) {
    getPropertyType(propertyTypeVersionedUri: $propertyTypeVersionedUri) {
      propertyTypeVersionedUri
      ownedById
      propertyType
    }
  }
`;

export const getAllLatestPropertyTypesQuery = gql`
  query getAllLatestPropertyTypes {
    getAllLatestPropertyTypes {
      propertyTypeVersionedUri
      ownedById
      propertyType
    }
  }
`;

export const createPropertyTypeMutation = gql`
  mutation createPropertyType(
    $ownedById: ID!
    $propertyType: PropertyTypeWithoutId!
  ) {
    createPropertyType(ownedById: $ownedById, propertyType: $propertyType) {
      propertyTypeVersionedUri
      ownedById
      propertyType
    }
  }
`;

export const updatePropertyTypeMutation = gql`
  mutation updatePropertyType(
    $propertyTypeVersionedUri: String!
    $updatedPropertyType: PropertyTypeWithoutId!
  ) {
    updatePropertyType(
      propertyTypeVersionedUri: $propertyTypeVersionedUri
      updatedPropertyType: $updatedPropertyType
    ) {
      propertyTypeVersionedUri
      ownedById
      propertyType
    }
  }
`;
