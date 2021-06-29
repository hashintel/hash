import gql from "graphql-tag";

export const createEntity = gql`
  mutation createEntity(
    $namespace: String
    $namespaceId: ID
    $properties: JSONObject!
    $type: String!
  ) {
    createEntity(
      namespace: $namespace
      namespaceId: $namespaceId
      properties: $properties
      type: $type
    ) {
      __typename
      id
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
  mutation updateEntity($id: ID!, $properties: JSONObject!) {
    updateEntity(id: $id, properties: $properties) {
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
  query aggregateEntity($type: String!, $operation: AggregateOperationInput) {
    aggregateEntity(type: $type, operation: $operation) {
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
