import { gql } from "@apollo/client";

export const getPropertyTypeQuery = gql`
  query getPropertyType($propertyTypeId: String!) {
    getPropertyType(propertyTypeId: $propertyTypeId) {
      propertyTypeId
      ownedById
      propertyType
    }
  }
`;

export const getAllLatestPropertyTypesQuery = gql`
  query getAllLatestPropertyTypes {
    getAllLatestPropertyTypes {
      propertyTypeId
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
      propertyTypeId
      ownedById
      propertyType
    }
  }
`;

export const updatePropertyTypeMutation = gql`
  mutation updatePropertyType(
    $propertyTypeId: String!
    $updatedPropertyType: PropertyTypeWithoutId!
  ) {
    updatePropertyType(
      propertyTypeId: $propertyTypeId
      updatedPropertyType: $updatedPropertyType
    ) {
      propertyTypeId
      ownedById
      propertyType
    }
  }
`;
