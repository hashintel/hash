import { gql } from "@apollo/client";

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
      ownedById
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
      ownedById
      entityId
    }
  }
`;
