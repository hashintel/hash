import { gql } from "apollo-server-express";

export const userTypedef = gql`
  extend type Query {
    me(
      hasLeftEntity: EdgeResolveDepthsInput! = { incoming: 0, outgoing: 0 }
      hasRightEntity: EdgeResolveDepthsInput! = { incoming: 0, outgoing: 0 }
    ): SubgraphAndPermissions!
    """
    Determines whether a provided shortname is already taken
    """
    isShortnameTaken(shortname: String!): Boolean!
  }
`;
