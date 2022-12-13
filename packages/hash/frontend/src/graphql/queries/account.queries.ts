import { gql } from "@apollo/client";

export const getAccountPagesTree = gql`
  query getAccountPagesTree($ownedById: AccountId) {
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
