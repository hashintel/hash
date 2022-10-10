import { gql } from "@apollo/client";

export const createPersistedComment = gql`
  mutation createPersistedComment(
    $ownedById: ID!
    $parentId: ID!
    $tokens: [TextToken!]!
  ) {
    createPersistedComment(
      ownedById: $ownedById
      parentId: $parentId
      tokens: $tokens
    ) {
      ownedById
      entityId
    }
  }
`;
