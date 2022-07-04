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
        properties {
          shortname
          preferredName
          emails {
            address
            primary
            verified
          }
        }
      }
      ... on Org {
        properties {
          shortname
          name
        }
      }
    }
  }
`;

export const getAccountPages = gql`
  query getAccountPages($accountId: ID!) {
    accountPages(accountId: $accountId) {
      entityId
      properties {
        title
        summary
      }
    }
  }
`;

export const getAccountPagesTree = gql`
  query getAccountPagesTree($accountId: ID!) {
    accountPages(accountId: $accountId) {
      entityId
      properties {
        title
        pageEntityId
      }
      parentPageEntityId
    }
  }
`;

export const getAccountEntityTypes = gql`
  query getAccountEntityTypes(
    $accountId: ID!
    $includeOtherTypesInUse: Boolean = false
  ) {
    getAccountEntityTypes(
      accountId: $accountId
      includeOtherTypesInUse: $includeOtherTypesInUse
    ) {
      entityId
      entityVersionId
      properties
    }
  }
`;
