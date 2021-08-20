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
