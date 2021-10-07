import { gql } from "@apollo/client";

const userFieldsFragment = gql`
  fragment UserFields on User {
    id
    entityId
    createdById
    accountId
    entityTypeId
    entityTypeVersionId
    entityTypeName
    visibility
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
      accountSignupComplete
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
      accountSignupComplete
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
      entityId
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
        emails {
          address
          primary
          verified
        }
      }
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

export const logout = gql`
  mutation logout {
    logout
  }
`;

export const meQuery = gql`
  query me {
    me {
      ...UserFields
      accountSignupComplete
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
  }
  ${userFieldsFragment}
`;
