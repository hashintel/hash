import { gql } from "@apollo/client";

export const getEntityTypeQuery = gql`
  query getEntityType($entityTypeVersionedUri: String!) {
    getEntityType(entityTypeVersionedUri: $entityTypeVersionedUri) {
      entityTypeVersionedUri
      accountId
      entityType
    }
  }
`;

export const getAllLatestEntityTypesQuery = gql`
  query getAllLatestEntityTypes {
    getAllLatestEntityTypes {
      entityTypeVersionedUri
      accountId
      entityType
    }
  }
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType($accountId: ID!, $entityType: EntityType!) {
    createEntityType(accountId: $accountId, entityType: $entityType) {
      entityTypeVersionedUri
      accountId
      entityType
    }
  }
`;

export const updateEntityTypeMutation = gql`
  mutation updateEntityType(
    $accountId: ID!
    $entityTypeVersionedUri: String!
    $updatedEntityType: EntityType!
  ) {
    updateEntityType(
      accountId: $accountId
      entityTypeVersionedUri: $entityTypeVersionedUri
      updatedEntityType: $updatedEntityType
    ) {
      entityTypeVersionedUri
      accountId
      entityType
    }
  }
`;
