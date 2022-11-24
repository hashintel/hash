import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const getPropertyTypeQuery = gql`
  query getPropertyType(
    $propertyTypeId: VersionedUri!
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
  ) {
    getPropertyType(
      propertyTypeId: $propertyTypeId
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
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
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const createPropertyTypeMutation = gql`
  mutation createPropertyType(
    $ownedById: ID!
    $propertyType: PropertyTypeWithoutId!
  ) {
    # This is a scalar, which has no selection.
    createPropertyType(ownedById: $ownedById, propertyType: $propertyType)
  }
`;

export const updatePropertyTypeMutation = gql`
  mutation updatePropertyType(
    $propertyTypeId: VersionedUri!
    $updatedPropertyType: PropertyTypeWithoutId!
  ) {
    # This is a scalar, which has no selection.
    updatePropertyType(
      propertyTypeId: $propertyTypeId
      updatedPropertyType: $updatedPropertyType
    )
  }
`;
