import { gql } from "@apollo/client";

export const commentFieldsFragment = gql`
  fragment CommentFields on PersistedComment {
    hasText
    textUpdatedAt
    author
    parent
    metadata
  }
`;

export const createPersistedComment = gql`
  mutation createPersistedComment(
    $parentEntityId: EntityId!
    $tokens: [TextToken!]!
  ) {
    createPersistedComment(parentEntityId: $parentEntityId, tokens: $tokens) {
      metadata
    }
  }
`;

export const resolvePersistedComment = gql`
  mutation resolvePersistedComment($entityId: EntityId!) {
    resolvePersistedComment(entityId: $entityId) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;

export const deletePersistedComment = gql`
  mutation deletePersistedComment($entityId: EntityId!) {
    deletePersistedComment(entityId: $entityId) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;

export const updatePersistedCommentText = gql`
  mutation updatePersistedCommentText(
    $entityId: EntityId!
    $tokens: [TextToken!]!
  ) {
    updatePersistedCommentText(entityId: $entityId, tokens: $tokens) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;
