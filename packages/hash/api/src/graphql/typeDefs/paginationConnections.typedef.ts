import { gql } from "apollo-server-express";

export const pagePagination = gql`
  type PageInfo {
    # could also just be a nextPageCursor since its presence encodes the boolean
    # kept in to comply with spec.
    hasNextPage: Boolean!
    nextPageCursor: String
  }

  # The OpenSearch cursors are not per item, unfortunately.
  # so the per-edge cursors are omitted
  type PageSearchResultEdge {
    # cursor: String!
    node: PageSearchResult!
  }

  type PageSearchResultConnection {
    pageInfo: PageInfo!
    edges: [PageSearchResultEdge!]!
  }

  extend type Query {
    """
    after expects a cursor
    """
    pageSearchResultConnection(
      accountId: ID!
      query: String!
      pageSize: Int!
      after: String
    ): PageSearchResultConnection!
  }
`;
