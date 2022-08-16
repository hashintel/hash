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
        pageEntityId
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
