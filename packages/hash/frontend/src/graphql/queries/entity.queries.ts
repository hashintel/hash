import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $accountId: ID!
    $createdById: ID!
    $properties: JSONObject!
    $type: String!
  ) {
    createEntity(
      accountId: $accountId
      createdById: $createdById
      properties: $properties
      type: $type
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
  mutation updateEntity($accountId: ID!, $id: ID!, $properties: JSONObject!) {
    updateEntity(accountId: $accountId, id: $id, properties: $properties) {
      __typename
      id
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
    aggregateEntity(
      accountId: $accountId
      type: $type
      operation: $operation
    ) {
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
