import { gql } from "apollo-server-express";

export const aggregationTypedef = gql`
  type LinkedAggregation {
    aggregationId: ID!
    sourceAccountId: ID!
    sourceEntityId: ID!
    path: String!
    operation: AggregateOperation!
    results: [UnknownEntity!]!
  }

  type AggregationResponse {
    operation: AggregateOperation
    results: [UnknownEntity!]!
  }

  type AggregateOperation {
    entityTypeId: ID!
    entityTypeVersionId: ID
    multiFilter: MultiFilterOperation
    multiSort: [SortOperation!]
    itemsPerPage: Int!
    pageNumber: Int!
    pageCount: Int!
  }

  type SortOperation {
    field: String!
    desc: Boolean
  }

  type MultiFilterOperation {
    filters: [FilterOperation!]!
    operator: String!
  }

  type FilterOperation {
    field: String!
    value: String!
    operator: String!
  }

  input AggregateOperationInput {
    entityTypeId: ID!
    entityTypeVersionId: ID
    multiFilter: MultiFilterOperationInput
    multiSort: [SortOperationInput!]
    itemsPerPage: Int = 10
    pageNumber: Int = 1
  }

  input SortOperationInput {
    field: String!
    desc: Boolean = false
  }

  input MultiFilterOperationInput {
    filters: [FilterOperationInput!]!
    operator: String!
  }

  input FilterOperationInput {
    field: String!
    value: String
    operator: String!
  }

  extend type Query {
    """
    Aggregate an entity
    """
    aggregateEntity(
      accountId: ID!
      operation: AggregateOperationInput!
    ): AggregationResponse!

    """
    Retrieve a linked aggregation
    """
    getLinkedAggregation(
      sourceAccountId: ID!
      aggregationId: ID!
    ): LinkedAggregation!
  }

  extend type Mutation {
    """
    Create a linked aggregation for an entity
    """
    createLinkedAggregation(
      sourceAccountId: ID!
      sourceEntityId: ID!
      path: String!
      operation: AggregateOperationInput!
    ): LinkedAggregation!
    """
    Update the operation of an entity's linked aggregation
    """
    updateLinkedAggregationOperation(
      sourceAccountId: ID!
      aggregationId: ID!
      updatedOperation: AggregateOperationInput!
    ): LinkedAggregation!
    """
    Delete an entity's linked aggregation
    """
    deleteLinkedAggregation(sourceAccountId: ID!, aggregationId: ID!): Boolean!
  }
`;
