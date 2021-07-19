import { gql } from "apollo-server-express";

export const userTypedef = gql`
  type User implements Entity {
    properties: UserProperties!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    id: ID!
    """
    The FIXED id for an account
    """
    accountId: ID!
    """
    The date the entity was created
    """
    createdAt: Date!
    """
    The user who created the entity
    """
    createdById: ID!
    """
    The date the entity was last updated
    """
    updatedAt: Date!
    """
    The visibility level of the entity
    """
    visibility: Visibility!
    """
    The type of entity
    """
    type: String!
    # ENTITY INTERFACE FIELDS END #
  }

  type UserProperties {
    email: String!
    shortname: String!
  }

  input UserIdentifier {
    email: String
    shortname: String
  }

  type LoginCodeMetadata {
    id: ID!
    createdAt: Date!
  }

  enum LoginWithLoginCodeResponse {
    SUCCESS
    EXPIRED
    MAX_ATTEMPTS
    INCORRECT
    NOT_FOUND
  }

  extend type Mutation {
    createUser(email: String!, shortname: String!): User!
    sendLoginCode(userIdentifier: UserIdentifier!): LoginCodeMetadata!
    loginWithLoginCode(
      userIdentifier: UserIdentifier!
      loginId: ID!
      loginCode: String!
    ): LoginWithLoginCodeResponse!
  }
`;
