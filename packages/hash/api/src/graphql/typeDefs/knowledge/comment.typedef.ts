import { gql } from "apollo-server-express";

export const persistedCommentTypedef = gql`
  type PersistedComment implements PersistedEntity {
    """
    Stringified timestamp of when the entity was resolved.
    """
    resolvedAt: String

    """
    Timestamp of when the comment was last edited
    """
    textUpdatedAt: Date!

    """
    Text contents of the comment
    """
    hasText: [TextToken!]!

    """
    User that created the comment
    """
    author: UnknownPersistedEntity!

    """
    Parent entity the comment belongs to
    """
    parent: PersistedEntity!

    """
    Array of comments created in response to this comment
    """
    replies: [PersistedComment!]!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    entityId: ID!
    """
    The specific version of the entity
    """
    entityVersion: String!
    """
    The id of the account that owns this entity.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this entity.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    """
    The versioned URI of this entity's type.
    """
    entityTypeId: String!
    """
    The full entity type definition.
    """
    entityType: PersistedEntityType!
    """
    The linked entities of the entity.
    """
    linkedEntities: [PersistedEntity!]!
    """
    The JSON object containing the entity's properties.
    """
    properties: JSONObject!
    # ENTITY INTERFACE FIELDS END #
  }

  extend type Query {
    persistedPageComments(ownedById: ID!, pageId: ID!): [PersistedComment!]!
  }

  extend type Mutation {
    """
    Create a new comment
    """
    createPersistedComment(
      """
      Account id of the block the comment belongs to
      """
      ownedById: ID!
      """
      Id of the block or comment the comment belongs to
      """
      parentEntityId: ID!
      """
      Text contents of the comment
      """
      tokens: [TextToken!]!
    ): PersistedComment!
  }
`;
