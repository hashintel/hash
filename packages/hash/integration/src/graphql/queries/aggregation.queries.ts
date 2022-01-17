import gql from "graphql-tag";

export const createLinkedAggregation = gql`
  mutation createLinkedAggregation(
    $sourceAccountId: ID!
    $sourceEntityId: ID!
    $path: String!
    $operation: AggregateOperationInput!
  ) {
    createLinkedAggregation(
      sourceAccountId: $sourceAccountId
      sourceEntityId: $sourceEntityId
      path: $path
      operation: $operation
    ) {
      sourceAccountId
      sourceEntityId
      path
      operation {
        entityTypeId
        itemsPerPage
        pageNumber
        pageCount
      }
      results {
        accountId
        entityId
      }
    }
  }
`;

export const updateLinkedAggregationOperation = gql`
  mutation updateLinkedAggregationOperation(
    $sourceAccountId: ID!
    $sourceEntityId: ID!
    $path: String!
    $updatedOperation: AggregateOperationInput!
  ) {
    updateLinkedAggregationOperation(
      sourceAccountId: $sourceAccountId
      sourceEntityId: $sourceEntityId
      path: $path
      updatedOperation: $updatedOperation
    ) {
      sourceAccountId
      sourceEntityId
      path
      operation {
        entityTypeId
        itemsPerPage
        pageNumber
        pageCount
      }
    }
  }
`;

export const deleteLinkedAggregation = gql`
  mutation deleteLinkedAggregation(
    $sourceAccountId: ID!
    $sourceEntityId: ID!
    $path: String!
  ) {
    deleteLinkedAggregation(
      sourceAccountId: $sourceAccountId
      sourceEntityId: $sourceEntityId
      path: $path
    )
  }
`;
