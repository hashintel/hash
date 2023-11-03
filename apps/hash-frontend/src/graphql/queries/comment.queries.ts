import { gql } from "@apollo/client";

export const commentFieldsFragment = gql`
  fragment CommentFields on Comment {
    canUserEdit
    hasText
    textUpdatedAt
    author
    parent
    metadata
  }
`;

export const createComment = gql`
  mutation createComment(
    $parentEntityId: EntityId!
    $textualContent: [TextToken!]!
  ) {
    createComment(
      parentEntityId: $parentEntityId
      textualContent: $textualContent
    ) {
      metadata
    }
  }
`;

export const resolveComment = gql`
  mutation resolveComment($entityId: EntityId!) {
    resolveComment(entityId: $entityId) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;

export const deleteComment = gql`
  mutation deleteComment($entityId: EntityId!) {
    deleteComment(entityId: $entityId) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;

export const updateCommentText = gql`
  mutation updateCommentText(
    $entityId: EntityId!
    $textualContent: [TextToken!]!
  ) {
    updateCommentText(entityId: $entityId, textualContent: $textualContent) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;
