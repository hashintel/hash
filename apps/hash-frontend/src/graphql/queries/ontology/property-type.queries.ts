import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "../subgraph";

export const getPropertyTypeQuery = gql`
  query getPropertyType(
    $propertyTypeId: VersionedUrl!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
  ) {
    getPropertyType(
      propertyTypeId: $propertyTypeId
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getAllLatestPropertyTypesQuery = gql`
  query getAllLatestPropertyTypes(
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
  ) {
    getAllLatestPropertyTypes(
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const createPropertyTypeMutation = gql`
  mutation createPropertyType(
    $ownedById: OwnedById!
    $propertyType: PropertyTypeWithoutId!
  ) {
    # This is a scalar, which has no selection.
    createPropertyType(ownedById: $ownedById, propertyType: $propertyType)
  }
`;

export const updatePropertyTypeMutation = gql`
  mutation updatePropertyType(
    $propertyTypeId: VersionedUrl!
    $updatedPropertyType: PropertyTypeWithoutId!
  ) {
    # This is a scalar, which has no selection.
    updatePropertyType(
      propertyTypeId: $propertyTypeId
      updatedPropertyType: $updatedPropertyType
    )
  }
`;
