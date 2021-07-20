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
      type
      visibility
      properties {
        shortname
        email
      }
    }
  }
`;

export const sendLoginCode = gql`
  mutation sendLoginCode($emailOrShortname: String!) {
    sendLoginCode(emailOrShortname: $emailOrShortname) {
      id
      userId
      createdAt
    }
  }
`;

export const loginWithLoginCode = gql`
  mutation loginWithLoginCode(
    $userId: ID!
    $loginId: ID!
    $loginCode: String!
  ) {
    loginWithLoginCode(
      userId: $userId
      loginId: $loginId
      loginCode: $loginCode
    )
  }
`;
