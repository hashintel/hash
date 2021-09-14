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

export const getUnknownEntity = gql`
  query getEntity($accountId: ID!, $entityId: ID, $entityVersionId: ID) {
    entity(
      accountId: $accountId
      entityId: $entityId
      entityVersionId: $entityVersionId
    ) {
      entityId
      entityVersionId
      properties
      history {
        entityVersionId
        createdAt
      }
      entityVersionCreatedAt
      createdAt
      updatedAt
      properties
    }
  }
`;

export const updateEntity = gql`
  mutation updateEntity(
    $accountId: ID!
    $entityId: ID!
    $properties: JSONObject!
  ) {
    updateEntity(
      accountId: $accountId
      entityId: $entityId
      properties: $properties
    ) {
      entityId
      entityVersionId
    }
  }
`;
