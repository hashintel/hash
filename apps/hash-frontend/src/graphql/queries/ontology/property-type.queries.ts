import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const getPropertyTypeQuery = gql`
  query getPropertyType(
    $propertyTypeId: VersionedUrl!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $includeArchived: Boolean = false
  ) {
    getPropertyType(
      propertyTypeId: $propertyTypeId
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      includeArchived: $includeArchived
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const queryPropertyTypesQuery = gql`
  query queryPropertyTypes(
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $latestOnly: Boolean = true
    $includeArchived: Boolean = false
  ) {
    queryPropertyTypes(
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      latestOnly: $latestOnly
      includeArchived: $includeArchived
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const createPropertyTypeMutation = gql`
  mutation createPropertyType(
    $ownedById: OwnedById!
    $propertyType: ConstructPropertyTypeParams!
  ) {
    # This is a scalar, which has no selection.
    createPropertyType(ownedById: $ownedById, propertyType: $propertyType)
  }
`;

export const updatePropertyTypeMutation = gql`
  mutation updatePropertyType(
    $propertyTypeId: VersionedUrl!
    $updatedPropertyType: ConstructPropertyTypeParams!
  ) {
    # This is a scalar, which has no selection.
    updatePropertyType(
      propertyTypeId: $propertyTypeId
      updatedPropertyType: $updatedPropertyType
    )
  }
`;

export const archivePropertyTypeMutation = gql`
  mutation archivePropertyType($propertyTypeId: VersionedUrl!) {
    archivePropertyType(propertyTypeId: $propertyTypeId)
  }
`;

export const unarchivePropertyTypeMutation = gql`
  mutation unarchivePropertyType($propertyTypeId: VersionedUrl!) {
    unarchivePropertyType(propertyTypeId: $propertyTypeId)
  }
`;
