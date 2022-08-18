import { gql } from "@apollo/client";

const entityTypeFieldsFragment = gql`
  fragment EntityTypeFields on DeprecatedEntityType {
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

export const deprecatedGetEntityTypeQuery = gql`
  query deprecatedGetEntityType($entityTypeId: ID!) {
    deprecatedGetEntityType(entityTypeId: $entityTypeId) {
      entityId
      properties
    }
  }
`;
export const deprecatedCreateEntityTypeMutation = gql`
  mutation deprecatedCreateEntityType(
    $accountId: ID!
    $description: String
    $name: String!
    $schema: JSONObject
  ) {
    deprecatedCreateEntityType(
      accountId: $accountId
      description: $description
      name: $name
      schema: $schema
    ) {
      accountId
      entityId
      entityTypeId
      entityTypeName
      properties
    }
  }
`;

export const deprecatedUpdateEntityTypeMutation = gql`
  mutation deprecatedUpdateEntityType($entityId: ID!, $schema: JSONObject!) {
    deprecatedUpdateEntityType(entityId: $entityId, schema: $schema) {
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
