import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $accountId: ID!
    $createdById: ID!
    $properties: JSONObject!
    $type: String!
    $versioned: Boolean! = true
  ) {
    createEntity(
      accountId: $accountId
      createdById: $createdById
      properties: $properties
      type: $type
      versioned: $versioned
    ) {
      __typename
      id
      createdById
      createdAt
      updatedAt
      accountId
      ... on UnknownEntity {
        properties
      }
      type
      visibility
    }
  }
`;

export const updateEntity = gql`
  mutation updateEntity(
    $accountId: ID!
    $id: ID!
    $metadataId: ID!
    $properties: JSONObject!
  ) {
    updateEntity(
      accountId: $accountId
      id: $id
      metadataId: $metadataId
      properties: $properties
    ) {
      __typename
      id
      metadataId
      type
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
    $type: String!
    $operation: AggregateOperationInput
  ) {
    aggregateEntity(accountId: $accountId, type: $type, operation: $operation) {
      __typename
      results {
        __typename
        id
        type
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
