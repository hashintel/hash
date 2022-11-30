import { gql } from "apollo-server-express";

export const userTypedef = gql`
  extend type Query {
    me(
      hasLeftEntity: EdgeResolveDepthsInput! = { incoming: 0, outgoing: 0 }
      hasRightEntity: EdgeResolveDepthsInput! = { incoming: 0, outgoing: 0 }
    ): Subgraph!
    """
    Determines whether a provided shortname is already taken
    """
    isShortnameTaken(shortname: String!): Boolean!
  }

  extend type Mutation {
    """
    Create a User.
    """
    createUser(
      """
      The email address of the user.
      """
      emailAddress: String!
      """
      The password of the user.
      """
      password: String!
      """
      Whether or not the user is a HASH instance admin.
      """
      isInstanceAdmin: Boolean!
      """
      The shortname of the user.
      """
      shortname: String
      """
      The preferred name of the user.
      """
      preferredName: String
      """
      The depth of entities that are returned in the response subgraph.
      """
      hasLeftEntity: EdgeResolveDepthsInput! = { incoming: 0, outgoing: 0 }
    ): Subgraph!
  }
`;
