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
