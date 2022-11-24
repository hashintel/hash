import { gql } from "apollo-server-express";

export const persistedCommentTypedef = gql`
  type PersistedComment {
    """
    Stringified timestamp of when the entity was resolved.
    """
    resolvedAt: String

    """
    Stringified timestamp of when the entity was deleted.
    """
    deletedAt: String

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
    author: Entity!

    """
    Parent entity the comment belongs to
    """
    parent: Entity!

    """
    Array of comments created in response to this comment
    """
    replies: [PersistedComment!]!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: PropertyObject!
    # ENTITY INTERFACE FIELDS END #
  }

  extend type Mutation {
    """
    Create a new comment
    """
    createPersistedComment(
      """
      Id of the block or comment the comment belongs to
      """
      parentEntityId: EntityId!
      """
      Text contents of the comment
      """
      tokens: [TextToken!]!
    ): PersistedComment!

    """
    Resolve an existing comment
    """
    resolvePersistedComment(
      """
      Id of the comment to resolve
      """
      entityId: EntityId!
    ): PersistedComment!

    """
    Delete an existing comment
    """
    deletePersistedComment(
      """
      Id of the comment to delete
      """
      entityId: EntityId!
    ): PersistedComment!

    """
    Edit an existing comment's text contents
    """
    updatePersistedCommentText(
      """
      Id of the comment being edited
      """
      entityId: EntityId!
      """
      New Text contents of the comment
      """
      tokens: [TextToken!]!
    ): PersistedComment!
  }
`;
