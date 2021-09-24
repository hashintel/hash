import { gql } from "apollo-server-express";

export const createOrg = gql`
  mutation createOrg($org: CreateOrgInput!, $responsibility: String!) {
    createOrg(org: $org, responsibility: $responsibility) {
      __typename
      entityId
      entityTypeName
      createdById
      createdAt
      updatedAt
      accountId
      visibility
      properties {
        shortname
      }
    }
  }
`;

export const createOrgEmailInvitation = gql`
  mutation createOrgEmailInvitation(
    $orgAccountId: ID!
    $orgEntityId: ID!
    $inviteeEmailAddress: String!
  ) {
    createOrgEmailInvitation(
      orgAccountId: $orgAccountId
      orgEntityId: $orgEntityId
      inviteeEmailAddress: $inviteeEmailAddress
    ) {
      properties {
        inviter {
          data {
            entityId
          }
        }
        inviteeEmailAddress
      }
    }
  }
`;

export const orgEmailInvitation = gql`
  query orgEmailInvitation(
    $orgAccountId: ID!
    $orgEntityId: ID!
    $emailInvitationToken: String!
  ) {
    orgEmailInvitation(
      orgAccountId: $orgAccountId
      orgEntityId: $orgEntityId
      emailInvitationToken: $emailInvitationToken
    ) {
      entityId
      properties {
        inviter {
          data {
            entityId
          }
        }
        inviteeEmailAddress
      }
    }
  }
`;

export const orgInvitation = gql`
  query orgInvitation(
    $orgAccountId: ID!
    $orgEntityId: ID!
    $invitationToken: String!
  ) {
    orgInvitation(
      orgAccountId: $orgAccountId
      orgEntityId: $orgEntityId
      invitationToken: $invitationToken
    ) {
      entityId
      properties {
        org {
          data {
            entityId
          }
        }
      }
    }
  }
`;

export const joinOrg = gql`
  mutation joinOrg(
    $orgAccountId: ID!
    $orgEntityId: ID!
    $verification: JoinOrgVerification!
    $responsibility: String!
  ) {
    joinOrg(
      orgAccountId: $orgAccountId
      orgEntityId: $orgEntityId
      verification: $verification
      responsibility: $responsibility
    ) {
      entityId
      properties {
        memberOf {
          org {
            data {
              entityId
            }
          }
          responsibility
        }
      }
    }
  }
`;

export const getAccounts = gql`
  query getAccounts {
    accounts {
      ... on Org {
        properties {
          shortname
        }
        accountId
      }
    }
  }
`;
