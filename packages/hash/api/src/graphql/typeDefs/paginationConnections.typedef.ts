import { gql } from "apollo-server-express";

export const pagePaginationTypedef = gql`
  """
  Information returned with paginated queries.

  Each pagination specifies if there are more results to request.
  Please use the 'nextPageCursor' for every subsequent pagination request with the 'after' parameter.
  """
  type PageInfo {
    # could also just be a nextPageCursor since its presence encodes the boolean
    # kept in to comply with the Connections spec.
    # @see https://relay.dev/graphql/connections.htm
    hasNextPage: Boolean!
    """
    Number of pages that can be paginated.
    This number reflects total result count divided by page size.
    """
    pageCount: Int!
    """
    To be used for every subsequent pagination request.
    """
    nextPageCursor: String
  }

  """
  An edge of a paginated query result.

  There are no cursors per-edge currently.
  """
  type PageSearchResultEdge {
    # cursor: String!
    node: PageSearchResult!
  }

  """
  The result of pagination is this connection type.
  pageInfo contains information about paginagtion.
  edges contain the actual results.
  """
  type PageSearchResultConnection {
    pageInfo: PageInfo!
    edges: [PageSearchResultEdge!]!
  }

  extend type Query {
    """
    Paginate an account's pages.
    """
    pageSearchResultConnection(
      """
      Page accountIds to filter results by.
      """
      accountId: ID!
      """
      Search query string.
      """
      query: String
      """
      Number of pages to return for each result set.
      This does not change the number of pages returned when using a cursor.
      """
      pageSize: Int = 20
      """
      Cursor used to continue pagination.
      Please use the value of 'nextPageCursor' from the previous results.
      """
      after: String
    ): PageSearchResultConnection!
  }
`;
