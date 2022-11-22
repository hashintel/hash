import { gql } from "apollo-server-express";

export const persistedUserTypedef = gql`
  extend type Query {
    me(entityResolveDepth: Int! = 0): Subgraph!
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
      The depth of links that are returned in the response subgraph.
      """
      linkResolveDepth: Int! = 0
      """
      The depth of link target entities that are returned in the response subgraph.
      """
      linkTargetEntityResolveDepth: Int! = 0
    ): Subgraph!
  }
`;
