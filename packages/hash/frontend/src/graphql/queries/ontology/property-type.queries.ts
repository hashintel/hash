import { gql } from "@apollo/client";

export const getPropertyTypeQuery = gql`
  query getPropertyType($propertyTypeId: String!) {
    getPropertyType(propertyTypeId: $propertyTypeId) {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth(depth: 0)
        propertyTypeResolveDepth(depth: 0)
        linkTypeResolveDepth(depth: 0)
        entityTypeResolveDepth(depth: 0)
        linkTargetEntityResolveDepth(depth: 0)
        linkResolveDepth(depth: 0)
      }
    }
  }
`;

export const getAllLatestPropertyTypesQuery = gql`
  query getAllLatestPropertyTypes {
    getAllLatestPropertyTypes {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth(depth: 0)
        propertyTypeResolveDepth(depth: 0)
        linkTypeResolveDepth(depth: 0)
        entityTypeResolveDepth(depth: 0)
        linkTargetEntityResolveDepth(depth: 0)
        linkResolveDepth(depth: 0)
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
