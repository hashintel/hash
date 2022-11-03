import { gql } from "@apollo/client";

export const commentFieldsFragment = gql`
  fragment CommentFields on PersistedComment {
    ownedById
    entityId
    hasText
    textUpdatedAt
    author {
      entityId
      properties
    }
    parent {
      entityId
    }
  }
`;

export const createPersistedComment = gql`
  mutation createPersistedComment(
    $parentEntityId: ID!
    $tokens: [TextToken!]!
  ) {
    createPersistedComment(parentEntityId: $parentEntityId, tokens: $tokens) {
      ownedById
      entityId
    }
  }
`;

export const resolvePersistedComment = gql`
  mutation resolvePersistedComment($entityId: ID!) {
    resolvePersistedComment(entityId: $entityId) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;

export const deletePersistedComment = gql`
  mutation deletePersistedComment($entityId: ID!) {
    deletePersistedComment(entityId: $entityId) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;

export const updatePersistedCommentText = gql`
  mutation updatePersistedCommentText($entityId: ID!, $tokens: [TextToken!]!) {
    updatePersistedCommentText(entityId: $entityId, tokens: $tokens) {
      ...CommentFields
    }
  }
  ${commentFieldsFragment}
`;
