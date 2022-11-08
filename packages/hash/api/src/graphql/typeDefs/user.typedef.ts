import { gql } from "apollo-server-express";

export const userTypedef = gql`
  extend type Query {
    me(linkResolveDepth: Int!, linkTargetEntityResolveDepth: Int!): Subgraph!
    """
    Determines whether a provided shortname is already taken
    """
    isShortnameTaken(shortname: String!): Boolean!
  }

  input UserEmailInput {
    address: String!
    verified: Boolean!
  }

  extend type Mutation {
    createUser(
      email: UserEmailInput!
      password: String!
      isInstanceAdmin: Boolean!
      shortname: String
      preferredName: String
      linkResolveDepth: Int!
      linkTargetEntityResolveDepth: Int!
    ): Subgraph!
  }
`;
