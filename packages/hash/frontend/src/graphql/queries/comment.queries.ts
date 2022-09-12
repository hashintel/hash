import { gql } from "@apollo/client";

export const createComment = gql`
  mutation createComment(
    $accountId: ID!
    $parentId: ID!
    $content: [TextToken!]!
  ) {
    createComment(
      accountId: $accountId
      parentId: $parentId
      content: $content
    ) {
      accountId
      entityId
    }
  }
`;
