import { gql } from "@apollo/client";

export const getEntityTypeQuery = gql`
  query getEntityType($entityTypeId: ID!) {
    getEntityType(entityTypeId: $entityTypeId) {
      entityId
      properties
    }
  }
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $accountId: ID!
    $description: String!
    $name: String!
  ) {
    createEntityType(
      accountId: $accountId
      description: $description
      name: $name
    ) {
      accountId
      createdById
      createdAt
      entityId
      entityVersionId
      entityTypeId
      entityTypeVersionId
      entityTypeName
      updatedAt
      properties
      visibility
    }
  }
`;
