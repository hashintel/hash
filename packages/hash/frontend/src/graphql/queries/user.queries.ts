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
      createdAt
    }
  }
`;

export const loginWithLoginCode = gql`
  mutation loginWithLoginCode($loginId: ID!, $loginCode: String!) {
    loginWithLoginCode(loginId: $loginId, loginCode: $loginCode) {
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

export const meQuery = gql`
  query me {
    me {
      id
      createdById
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
