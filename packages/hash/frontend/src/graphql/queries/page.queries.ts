import { gql } from "@apollo/client";

//
// into this file since it is currently only used by the
// frontend package

/**
 * @todo: move createPage from shared/src/../page.queries
 * into this file since it is currently only used by the
 * frontend package
 * @see https://github.com/hashintel/hash/pull/409#discussion_r833559404
 */

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
