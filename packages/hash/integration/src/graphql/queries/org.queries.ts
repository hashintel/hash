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
    $invitationEmailToken: String!
  ) {
    orgEmailInvitation(
      orgAccountId: $orgAccountId
      orgEntityId: $orgEntityId
      invitationEmailToken: $invitationEmailToken
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

export const orgInvitationLink = gql`
  query orgInvitationLink(
    $orgAccountId: ID!
    $orgEntityId: ID!
    $invitationLinkToken: String!
  ) {
    orgInvitationLink(
      orgAccountId: $orgAccountId
      orgEntityId: $orgEntityId
      invitationLinkToken: $invitationLinkToken
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
        emails {
          address
          verified
          primary
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
