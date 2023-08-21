import { gql } from "@apollo/client";

export const getAccountPagesTree = gql`
  query getAccountPagesTree($ownedById: OwnedById, $includeArchived: Boolean) {
    pages(ownedById: $ownedById, includeArchived: $includeArchived) {
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
