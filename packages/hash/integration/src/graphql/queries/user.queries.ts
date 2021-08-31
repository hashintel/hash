import { gql } from "@apollo/client";

export const createUser = gql`
  mutation createUser($email: String!) {
    createUser(email: $email) {
      __typename
      id
      createdAt
    }
  }
`;
