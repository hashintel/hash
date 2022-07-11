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
      aggregationId
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
    $aggregationId: ID!
    $updatedOperation: AggregateOperationInput!
  ) {
    updateLinkedAggregationOperation(
      sourceAccountId: $sourceAccountId
      aggregationId: $aggregationId
      updatedOperation: $updatedOperation
    ) {
      aggregationId
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
  mutation deleteLinkedAggregation($sourceAccountId: ID!, $aggregationId: ID!) {
    deleteLinkedAggregation(
      sourceAccountId: $sourceAccountId
      aggregationId: $aggregationId
    )
  }
`;
