import { gql } from "apollo-server-express";

export const userTypedef = gql`
  type User implements Entity {
    properties: UserProperties!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity - alias of 'entityId'
    """
    id: ID!
    """
    The id of the entity - alias of 'id'
    """
    entityId: ID!
    """
    The specific version if of the entity
    """
    entityVersionId: ID!
    """
    The id of the account this entity belongs to
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
    The fixed id of the type this entity is of
    """
    entityTypeId: ID!
    """
    The id of the specific version of the type this entity is of
    """
    entityTypeVersionId: ID!
    """
    The name of the entity type this belongs to.
    N.B. Type names are unique by account - not globally.
    """
    entityTypeName: String!
    """
    The full entityType definition
    """
    entityType: EntityType!
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
