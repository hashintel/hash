import { gql } from "apollo-server-express";

export const commentTypedef = gql`
  scalar EntityVersion

  type Comment {
    """
    Stringified timestamp of when the entity was resolved.
    """
    resolvedAt: String

    """
    Stringified timestamp of when the entity was deleted.
    """
    deletedAt: String

    """
    Version information of when the comment was last edited
    """
    textUpdatedAt: EntityVersion!

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
    replies: [Comment!]!
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: PropertyObject!
  }

  extend type Mutation {
    """
    Create a new comment
    """
    createComment(
      """
      Id of the block or comment the comment belongs to
      """
      parentEntityId: EntityId!
      """
      Text contents of the comment
      """
      tokens: [TextToken!]!
    ): Comment!

    """
    Resolve an existing comment
    """
    resolveComment(
      """
      Id of the comment to resolve
      """
      entityId: EntityId!
    ): Comment!

    """
    Delete an existing comment
    """
    deleteComment(
      """
      Id of the comment to delete
      """
      entityId: EntityId!
    ): Comment!

    """
    Edit an existing comment's text contents
    """
    updateCommentText(
      """
      Id of the comment being edited
      """
      entityId: EntityId!
      """
      New Text contents of the comment
      """
      tokens: [TextToken!]!
    ): Comment!
  }
`;
