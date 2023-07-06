import { gql } from "@apollo/client";

export const getAccountPagesTree = gql`
  query getAccountPagesTree($ownedById: OwnedById) {
    pages(ownedById: $ownedById) {
      archived
      icon
      index
      title
      parentPage {
        metadata
      }
      metadata
    }
  }
`;
