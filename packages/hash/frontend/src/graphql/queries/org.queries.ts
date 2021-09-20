import { gql } from "apollo-server-express";

export const createOrg = gql`
  mutation createOrg($org: CreateOrgInput!) {
    createOrg(org: $org) {
      __typename
      id
      createdById
      createdAt
      updatedAt
      accountId
      entityTypeId
      entityTypeVersionId
      entityTypeName
      visibility
      properties {
        shortname
      }
    }
  }
`;
