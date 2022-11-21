import gql from "graphql-tag";

export const createPage = gql`
  mutation createPage(
    $ownedById: ID!
    $properties: PersistedPageCreationData!
  ) {
    createPersistedPage(ownedById: $ownedById, properties: $properties) {
      metadata
    }
  }
`;

export const getAccountPagesTree = gql`
  query getAccountPagesTree($ownedById: ID!) {
    persistedPages(ownedById: $ownedById) {
      title
      parentPage {
        metadata
      }
      metadata
    }
  }
`;

export const setPageParent = gql`
  mutation setParentPage(
    $pageEntityId: EntityId!
    $parentPageEntityId: EntityId
  ) {
    setParentPersistedPage(
      pageEntityId: $pageEntityId
      parentPageEntityId: $parentPageEntityId
    ) {
      title
      summary
      metadata
    }
  }
`;
