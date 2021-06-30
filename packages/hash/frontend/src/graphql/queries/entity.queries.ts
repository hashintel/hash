import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $namespaceId: ID!
    $createdById: ID!
    $properties: JSONObject!
    $type: String!
  ) {
    createEntity(
      namespaceId: $namespaceId
      createdById: $createdById
      properties: $properties
      type: $type
    ) {
      __typename
      id
      createdById
      createdAt
      updatedAt
      namespaceId
      ... on UnknownEntity {
        properties
      }
      type
      visibility
    }
  }
`;

export const updateEntity = gql`
  mutation updateEntity($namespaceId: ID!, $id: ID!, $properties: JSONObject!) {
    updateEntity(namespaceId: $namespaceId, id: $id, properties: $properties) {
      __typename
      id
      updatedAt
      ... on UnknownEntity {
        properties
      }
    }
  }
`;

export const aggregateEntity = gql`
  query aggregateEntity($namespaceId: ID!, $type: String!, $operation: AggregateOperationInput) {
    aggregateEntity(namespaceId: $namespaceId, type: $type, operation: $operation) {
      __typename
      results {
        __typename
        id
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
