import { gql } from "@apollo/client";

export const getAccountPagesTree = gql`
  query getAccountPagesTree($ownedById: OwnedById) {
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
