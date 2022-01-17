import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $accountId: ID!
    $properties: JSONObject!
    $systemTypeName: SystemTypeName
    $entityTypeId: ID
    $versioned: Boolean! = true
  ) {
    createEntity(
      accountId: $accountId
      properties: $properties
      systemTypeName: $systemTypeName
      entityTypeId: $entityTypeId
      versioned: $versioned
    ) {
      __typename
      entityId
      entityVersionId
      createdByAccountId
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

export const getEntityType = gql`
  query getEntityType($entityTypeId: ID!) {
    getEntityType(entityTypeId: $entityTypeId) {
      entityId
      entityVersionId
      properties
      __typename
    }
  }
`;

export const createEntityType = gql`
  mutation createEntityType(
    $accountId: ID!
    $description: String
    $name: String!
    $schema: JSONObject!
  ) {
    createEntityType(
      accountId: $accountId
      description: $description
      name: $name
      schema: $schema
    ) {
      entityId
      entityTypeName
      properties
    }
  }
`;

export const updateEntityType = gql`
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
      entityId
      entityTypeName
      properties
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
      entityTypeId
      entityTypeVersionId
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

export const getEntities = gql`
  query getEntities($accountId: ID!, $filter: EntityFilter) {
    entities(accountId: $accountId, filter: $filter) {
      entityId
      accountId
      entityTypeId
      entityTypeName
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
