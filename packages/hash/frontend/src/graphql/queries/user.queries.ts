import { gql } from "@apollo/client";

const userFieldsFragment = gql`
  fragment UserFields on User {
    __typename
    entityId
    createdByAccountId
    accountId
    entityTypeId
    entityTypeVersionId
    entityTypeName
    visibility
    accountSignupComplete
    memberOf {
      entityId
      org {
        entityId
        accountId
        memberships {
          entityId
        }
        properties {
          name
        }
      }
    }
    properties {
      shortname
      preferredName
      emails {
        address
        primary
        verified
      }
    }
  }
`;

export const createUser = gql`
  mutation createUser($email: String!) {
    createUser(email: $email) {
      __typename
      id
      createdAt
    }
  }
`;

export const createUserWithOrgEmailInvitation = gql`
  mutation createUserWithOrgEmailInvitation(
    $orgEntityId: ID!
    $invitationEmailToken: String!
  ) {
    createUserWithOrgEmailInvitation(
      orgEntityId: $orgEntityId
      invitationEmailToken: $invitationEmailToken
    ) {
      ...UserFields
    }
  }
  ${userFieldsFragment}
`;

export const isShortnameTaken = gql`
  query isShortnameTaken($shortname: String!) {
    isShortnameTaken(shortname: $shortname)
  }
`;

export const updateUser = gql`
  mutation updateUser($userEntityId: ID!, $properties: UpdateUserProperties!) {
    updateUser(userEntityId: $userEntityId, properties: $properties) {
      ...UserFields
    }
  }
  ${userFieldsFragment}
`;

export const verifyEmail = gql`
  mutation verifyEmail($verificationId: ID!, $verificationCode: String!) {
    verifyEmail(
      verificationId: $verificationId
      verificationCode: $verificationCode
    ) {
      __typename
      ...UserFields
    }
  }
  ${userFieldsFragment}
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
      ...UserFields
    }
  }
  ${userFieldsFragment}
`;

export const logout = gql`
  mutation logout {
    logout
  }
`;

export const meQuery = gql`
  query me {
    me {
      ...UserFields
    }
  }
  ${userFieldsFragment}
`;
