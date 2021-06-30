import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $namespace: String
    $namespaceId: ID
    $createdById: ID!
    $properties: JSONObject!
    $type: String!
  ) {
    createEntity(
      namespace: $namespace
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
      namespace
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
