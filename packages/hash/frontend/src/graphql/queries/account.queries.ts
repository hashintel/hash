import { gql } from "@apollo/client";

export const getAccountPagesTree = gql`
  query getAccountPagesTree($ownedById: ID) {
    persistedPages(ownedById: $ownedById) {
      title
      index
      parentPage {
        metadata
      }
      metadata
    }
  }
`;
