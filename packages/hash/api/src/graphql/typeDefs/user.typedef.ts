import { gql } from "apollo-server-express";

export const userTypedef = gql`
  extend type Query {
    me(linkResolveDepth: Int!, linkTargetEntityResolveDepth: Int!): Subgraph!
    """
    Determines whether a provided shortname is already taken
    """
    isShortnameTaken(shortname: String!): Boolean!
  }
`;
