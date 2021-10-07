import { gql } from "@apollo/client";

export const createOrg = gql`
  mutation createOrg($org: CreateOrgInput!, $responsibility: String!) {
    createOrg(org: $org, responsibility: $responsibility) {
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
