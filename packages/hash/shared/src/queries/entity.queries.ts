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
    $entityId: ID!
    $properties: JSONObject!
  ) {
    updateEntity(
      accountId: $accountId
      entityId: $entityId
      properties: $properties
    ) {
      __typename
      id
      entityId
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
        pageNumber
        pageCount
        itemsPerPage
        multiSort {
          field
          desc
        }
        multiFilter {
          operator
          filters {
            field
            value
            operator
          }
        }
      }
    }
  }
`;
