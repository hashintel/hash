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
      type
      visibility
      properties {
        shortname
      }
    }
  }
`;
