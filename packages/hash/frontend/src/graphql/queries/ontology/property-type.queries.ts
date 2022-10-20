import { gql } from "@apollo/client";

export const getPropertyTypeQuery = gql`
  query getPropertyType(
    $propertyTypeId: String!
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
  ) {
    getPropertyType(
      propertyTypeId: $propertyTypeId
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
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

export const getAllLatestPropertyTypesQuery = gql`
  query getAllLatestPropertyTypes(
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
  ) {
    getAllLatestPropertyTypes(
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
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
