import { gql } from "@apollo/client";

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
    $prevIndex: String
    $nextIndex: String
  ) {
    setParentPage(
      accountId: $accountId
      pageEntityId: $pageEntityId
      parentPageEntityId: $parentPageEntityId
      prevIndex: $prevIndex
      nextIndex: $nextIndex
    ) {
      accountId
      entityId
      properties {
        title
        summary
        pageEntityId
        __typename
      }
      __typename
    }
  }
`;

export const createPage = gql`
  mutation createPage(
    $accountId: ID!
    $properties: PageCreationData!
    $prevIndex: String
  ) {
    createPage(
      accountId: $accountId
      properties: $properties
      prevIndex: $prevIndex
    ) {
      accountId
      entityId
    }
  }
`;

export const getPageComments = gql`
  query getPageComments($accountId: ID!, $pageId: ID!) {
    pageComments(accountId: $accountId, pageId: $pageId) {
      accountId
      entityId
      tokens
      createdAt
      textUpdatedAt
      author {
        entityId
        properties {
          preferredName
        }
      }
      parent {
        entityId
      }
    }
  }
`;
