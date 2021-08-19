import { gql } from "apollo-server-express";

export const createOrg = gql`
  mutation createOrg($shortname: String!) {
    createOrg(shortname: $shortname) {
      __typename
      id
      createdById
      createdAt
      updatedAt
      accountId
      visibility
      properties {
        shortname
      }
    }
  }
`;

export const getAccounts = gql`
  query getAccounts {
    accounts {
      ... on Org {
        properties {
          shortname
        }
        accountId
      }
    }
  }
`;
