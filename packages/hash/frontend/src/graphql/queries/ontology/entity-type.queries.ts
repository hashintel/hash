import { gql } from "@apollo/client";

export const getEntityTypeQuery = gql`
  query getEntityType($entityTypeVersionedUri: String!) {
    getEntityType(entityTypeVersionedUri: $entityTypeVersionedUri) {
      entityTypeVersionedUri
      ownedById
      entityType
    }
  }
`;

export const getAllLatestEntityTypesQuery = gql`
  query getAllLatestEntityTypes {
    getAllLatestEntityTypes {
      entityTypeVersionedUri
      ownedById
      entityType
    }
  }
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $ownedById: ID!
    $entityType: EntityTypeWithoutId!
  ) {
    createEntityType(ownedById: $ownedById, entityType: $entityType) {
      entityTypeVersionedUri
      ownedById
      entityType
    }
  }
`;

export const updateEntityTypeMutation = gql`
  mutation updateEntityType(
    $entityTypeVersionedUri: String!
    $updatedEntityType: EntityTypeWithoutId!
  ) {
    updateEntityType(
      entityTypeVersionedUri: $entityTypeVersionedUri
      updatedEntityType: $updatedEntityType
    ) {
      entityTypeVersionedUri
      ownedById
      entityType
    }
  }
`;
