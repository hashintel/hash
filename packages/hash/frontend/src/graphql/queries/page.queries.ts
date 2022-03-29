import { gql } from "@apollo/client";

export const setParentPage = gql`
  mutation setParentPage(
    $accountId: ID!
    $pageEntityId: ID!
    $parentPageEntityId: ID
  ) {
    setParentPage(
      accountId: $accountId
      pageEntityId: $pageEntityId
      parentPageEntityId: $parentPageEntityId
    ) {
      accountId
      entityId
      properties {
        title
        summary
        __typename
      }
      __typename
    }
  }
`;
