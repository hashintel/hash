import { gql } from "@apollo/client";

export const commentFieldsFragment = gql`
  fragment CommentFields on Comment {
    hasText
    textUpdatedAt
    author
    parent
    metadata
  }
`;

export const createComment = gql`
  mutation createComment($parentEntityId: EntityId!, $tokens: [TextToken!]!) {
    createComment(parentEntityId: $parentEntityId, tokens: $tokens) {
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
  mutation updateCommentText($entityId: EntityId!, $tokens: [TextToken!]!) {
    updateCommentText(entityId: $entityId, tokens: $tokens) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;
