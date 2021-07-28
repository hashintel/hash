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
    """
    The version timeline of the entity.
    """
    history: [EntityVersion!]
    """
    The metadata ID of the entity. This is shared across all versions of the same entity.
    """
    metadataId: ID!
    # ENTITY INTERFACE FIELDS END #
  }

  type UserProperties {
    email: String!
    shortname: String!
  }

  type LoginCodeMetadata {
    id: ID!
    createdAt: Date!
  }

  enum LogoutResponse {
    SUCCESS
  }

  extend type Query {
    me: User!
  }

  extend type Mutation {
    createUser(email: String!, shortname: String!): User!
    sendLoginCode(emailOrShortname: String!): LoginCodeMetadata!
    loginWithLoginCode(loginId: ID!, loginCode: String!): User!
    logout: LogoutResponse!
  }
`;
