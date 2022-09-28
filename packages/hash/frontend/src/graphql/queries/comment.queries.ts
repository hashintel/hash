import { gql } from "@apollo/client";

export const createComment = gql`
  mutation createComment(
    $accountId: ID!
    $parentId: ID!
    $tokens: [TextToken!]!
  ) {
    createComment(accountId: $accountId, parentId: $parentId, tokens: $tokens) {
      accountId
      entityId
    }
  }
`;
