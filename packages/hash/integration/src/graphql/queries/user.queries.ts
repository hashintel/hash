import { gql } from "@apollo/client";

export const createUser = gql`
  mutation createUser($email: String!, $shortname: String!) {
    createUser(email: $email, shortname: $shortname) {
      __typename
      id
      createdById
      createdAt
      updatedAt
      accountId
      visibility
      properties {
        shortname
        email
      }
    }
  }
`;
