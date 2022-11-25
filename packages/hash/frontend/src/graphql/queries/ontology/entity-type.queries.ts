import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const getEntityTypeQuery = gql`
  query getEntityType(
    $entityTypeId: VersionedUri!
    $constrainsValuesOn: Int!
    $propertyTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsValuesOn: $constrainsValuesOn
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      entityTypeResolveDepth: $entityTypeResolveDepth
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getAllLatestEntityTypesQuery = gql`
  query getAllLatestEntityTypes(
    $constrainsValuesOn: Int!
    $propertyTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
  ) {
    getAllLatestEntityTypes(
      constrainsValuesOn: $constrainsValuesOn
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      entityTypeResolveDepth: $entityTypeResolveDepth
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getEntityTypeRootedSubgraphQuery = gql`
  query getEntityTypeRootedSubgraph(
    $entityTypeId: VersionedUri!
    $constrainsValuesOn: Int!
    $propertyTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsValuesOn: $constrainsValuesOn
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      entityTypeResolveDepth: $entityTypeResolveDepth
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $ownedById: ID!
    $entityType: EntityTypeWithoutId!
  ) {
    # This is a scalar, which has no selection.
    createEntityType(ownedById: $ownedById, entityType: $entityType)
  }
`;

export const updateEntityTypeMutation = gql`
  mutation updateEntityType(
    $entityTypeId: VersionedUri!
    $updatedEntityType: EntityTypeWithoutId!
  ) {
    updateEntityType(
      entityTypeId: $entityTypeId
      updatedEntityType: $updatedEntityType
    )
  }
`;
