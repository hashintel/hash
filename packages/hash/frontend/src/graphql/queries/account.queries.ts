import { gql } from "@apollo/client";

export const getAccountPagesTree = gql`
  query getAccountPagesTree($ownedById: ID) {
    pages(ownedById: $ownedById) {
      title
      index
      parentPage {
        metadata
      }
      metadata
    }
  }
`;
