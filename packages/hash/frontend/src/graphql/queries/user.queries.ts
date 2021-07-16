import { gql } from "apollo-server-express";

export const createUser = gql`
  mutation createUser($email: String!, $shortname: String!) {
    createUser(email: $email, shortname: $shortname) {
      __typename
      id
      createdById
      createdAt
      updatedAt
      namespaceId
      type
      visibility
      properties {
        shortname
        email
      }
    }
  }
`;
