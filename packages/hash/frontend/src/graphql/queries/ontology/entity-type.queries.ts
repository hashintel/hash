import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const getEntityTypeQuery = gql`
  query getEntityType(
    $entityTypeId: VersionedUri!
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $linkTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      linkTypeResolveDepth: $linkTypeResolveDepth
      entityTypeResolveDepth: $entityTypeResolveDepth
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getAllLatestEntityTypesQuery = gql`
  query getAllLatestEntityTypes(
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $linkTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
  ) {
    getAllLatestEntityTypes(
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      linkTypeResolveDepth: $linkTypeResolveDepth
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
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $linkTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      linkTypeResolveDepth: $linkTypeResolveDepth
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
