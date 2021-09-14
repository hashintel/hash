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

export const sendLoginCode = gql`
  mutation sendLoginCode($emailOrShortname: String!) {
    sendLoginCode(emailOrShortname: $emailOrShortname) {
      __typename
      id
      createdAt
    }
  }
`;

export const loginWithLoginCode = gql`
  mutation loginWithLoginCode(
    $verificationId: ID!
    $verificationCode: String!
  ) {
    loginWithLoginCode(
      verificationId: $verificationId
      verificationCode: $verificationCode
    ) {
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
      accountSignupComplete
      properties {
        shortname
        emails {
          address
          primary
          verified
        }
      }
    }
  }
`;
