import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $accountId: ID!
    $properties: JSONObject!
    $systemTypeName: SystemTypeName
    $entityTypeId: ID
    $versioned: Boolean! = true
    $linkedEntities: [LinkedEntityDefinition!]
  ) {
    createEntity(
      accountId: $accountId
      entity: {
        entityProperties: $properties
        versioned: $versioned
        entityType: {
          entityTypeId: $entityTypeId
          systemTypeName: $systemTypeName
        }
        linkedEntities: $linkedEntities
      }
    ) {
      __typename
      entityId
      entityVersionId
      createdByAccountId
      createdAt
      updatedAt
      accountId
      properties
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
      children {
        entityId
        properties
      }

      parents {
        entityId
        properties
      }
      __typename
    }
  }
`;

export const getEntityTypeAllParents = gql`
  query getEntityTypeAllParents($entityTypeId: ID!) {
    getEntityType(entityTypeId: $entityTypeId) {
      entityId
      entityVersionId
      properties
      ancestors {
        entityId
        properties
      }
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
  mutation updateEntityType($entityId: ID!, $schema: JSONObject!) {
    updateEntityType(entityId: $entityId, schema: $schema) {
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

export const getEntityAndLinks = gql`
  query getEntityAndLinks(
    $accountId: ID!
    $entityId: ID
    $entityVersionId: ID
  ) {
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
      linkedEntities {
        entityId
        entityTypeId
        entityTypeName
      }
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
