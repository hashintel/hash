import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $accountId: ID!
    $createdById: ID!
    $properties: JSONObject!
    $entityTypeId: ID
    $entityTypeVersionId: ID
    $systemTypeName: SystemTypeName
    $versioned: Boolean! = true
  ) {
    createEntity(
      accountId: $accountId
      createdById: $createdById
      properties: $properties
      entityTypeId: $entityTypeId
      entityTypeVersionId: $entityTypeVersionId
      systemTypeName: $systemTypeName
      versioned: $versioned
    ) {
      __typename
      id
      createdById
      createdAt
      entityTypeId
      entityTypeVersionId
      entityTypeName
      updatedAt
      accountId
      ... on UnknownEntity {
        properties
      }
      visibility
    }
  }
`;

export const updateEntity = gql`
  mutation updateEntity(
    $accountId: ID!
    $metadataId: ID!
    $properties: JSONObject!
  ) {
    updateEntity(
      accountId: $accountId
      metadataId: $metadataId
      properties: $properties
    ) {
      __typename
      id
      metadataId
      entityTypeId
      entityTypeVersionId
      entityTypeName
      updatedAt
      ... on UnknownEntity {
        properties
      }
    }
  }
`;

export const aggregateEntity = gql`
  query aggregateEntity(
    $accountId: ID!
    $entityTypeId: ID!
    $entityTypeVersionId: ID
    $operation: AggregateOperationInput
  ) {
    aggregateEntity(
      accountId: $accountId
      entityTypeId: $entityTypeId
      entityTypeVersionId: $entityTypeVersionId
      operation: $operation
    ) {
      __typename
      results {
        __typename
        id
        entityTypeId
        entityTypeVersionId
        entityTypeName
        ... on UnknownEntity {
          properties
        }
      }
      operation {
        page
        perPage
        sort
      }
    }
  }
`;
