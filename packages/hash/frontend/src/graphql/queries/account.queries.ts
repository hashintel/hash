import { gql } from "@apollo/client";

export const getAccounts = gql`
  query getAccounts {
    accounts {
      __typename
      ... on Entity {
        entityId
        accountId
      }
      ... on User {
        memberOf {
          entityId
          org {
            entityId
            accountId
          }
        }
        shortname
        preferredName
        emails {
          address
          primary
          verified
        }
      }
      ... on Org {
        shortname
        name
      }
    }
  }
`;

export const getAccountPagesTree = gql`
  query getAccountPagesTree($ownedById: ID) {
    persistedPages(ownedById: $ownedById) {
      entityId
      title
      index
      parentPage {
        entityId
      }
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
