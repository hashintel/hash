import { gql } from "@apollo/client";

/**
 * @todo: move createPage from shared/src/../page.queries
 * into this file since it is currently only used by the
 * frontend package
 * @see https://github.com/hashintel/hash/pull/409#discussion_r833559404
 */

export const setParentPage = gql`
  mutation setParentPage(
    $pageEntityId: ID!
    $parentPageEntityId: ID
    $prevIndex: String
    $nextIndex: String
  ) {
    setParentKnowledgePage(
      pageEntityId: $pageEntityId
      parentPageEntityId: $parentPageEntityId
      prevIndex: $prevIndex
      nextIndex: $nextIndex
    ) {
      accountId
      entityId
      title
      summary
      __typename
    }
  }
`;

export const createKnowledgePage = gql`
  mutation createKnowledgePage(
    $ownedById: ID!
    $properties: KnowledgePageCreationData!
  ) {
    createKnowledgePage(ownedById: $ownedById, properties: $properties) {
      accountId
      entityId
    }
  }
`;
