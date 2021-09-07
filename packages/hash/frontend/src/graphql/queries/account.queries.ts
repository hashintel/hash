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
        }
      }
    }
  }
`;

export const getAccountPages = gql`
  query getAccountPages($accountId: ID!) {
    accountPages(accountId: $accountId) {
      id
      metadataId
      properties {
        title
        summary
      }
    }
  }
`;

export const getAccountEntityTypes = gql`
  query getAccountEntityTypes($accountId: ID!) {
    getAccountEntityTypes(accountId: $accountId) {
      entityId
      entityVersionId
      properties
    }
  }
`;
