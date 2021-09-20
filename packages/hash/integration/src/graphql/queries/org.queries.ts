import { gql } from "apollo-server-express";

export const createOrg = gql`
  mutation createOrg($org: CreateOrgInput!) {
    createOrg(org: $org) {
      __typename
      id
      entityTypeName
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
