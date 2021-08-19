import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $accountId: ID!
    $createdById: ID!
    $properties: JSONObject!
    $systemTypeName: SystemTypeName
    $entityTypeId: ID
    $versioned: Boolean! = true
  ) {
    createEntity(
      accountId: $accountId
      createdById: $createdById
      properties: $properties
      systemTypeName: $systemTypeName
      entityTypeId: $entityTypeId
      versioned: $versioned
    ) {
      __typename
      id
      entityVersionId
      createdById
      createdAt
      updatedAt
      accountId
      ... on UnknownEntity {
        properties
      }
      visibility
    }
  }
`;

export const createEntityType = gql`
  mutation createEntityType(
    $accountId: ID!
    $name: String!
    $schema: JSONObject!
  ) {
    createEntityType(accountId: $accountId, name: $name, schema: $schema) {
      entityId
      entityTypeName
    }
  }
`;
