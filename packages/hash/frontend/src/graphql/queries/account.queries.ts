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

export const deprecatedGetAccountEntityTypes = gql`
  query deprecatedGetAccountEntityTypes(
    $accountId: ID!
    $includeAllTypes: Boolean = false
    $includeOtherTypesInUse: Boolean = false
  ) {
    deprecatedGetAccountEntityTypes(
      accountId: $accountId
      includeAllTypes: $includeAllTypes
      includeOtherTypesInUse: $includeOtherTypesInUse
    ) {
      entityId
      entityTypeId
      entityVersionId
      properties
    }
  }
`;
