import { gql } from "@apollo/client";

const entityTypeFieldsFragment = gql`
  fragment EntityTypeFields on EntityType {
    accountId
    createdByAccountId
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
`;

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
      ...EntityTypeFields
    }
  }
  ${entityTypeFieldsFragment}
`;

export const updateEntityTypeMutation = gql`
  mutation updateEntityType(
    $accountId: ID!
    $entityId: ID!
    $schema: JSONObject!
  ) {
    updateEntityType(
      accountId: $accountId
      entityId: $entityId
      schema: $schema
    ) {
      ...EntityTypeFields
    }
  }
  ${entityTypeFieldsFragment}
`;

export const transferEntityMutation = gql`
  mutation transferEntity(
    $originalAccountId: ID!
    $entityId: ID!
    $newAccountId: ID!
  ) {
    transferEntity(
      originalAccountId: $originalAccountId
      entityId: $entityId
      newAccountId: $newAccountId
    ) {
      accountId
      entityId
    }
  }
`;
