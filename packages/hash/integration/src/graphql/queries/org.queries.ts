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
        invitationLink {
          data {
            entityId
            properties {
              accessToken
            }
          }
        }
      }
    }
  }
`;

export const createOrgEmailInvitation = gql`
  mutation createOrgEmailInvitation(
    $orgEntityId: ID!
    $inviteeEmailAddress: String!
  ) {
    createOrgEmailInvitation(
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
  query getOrgEmailInvitation(
    $orgEntityId: ID!
    $invitationEmailToken: String!
  ) {
    getOrgEmailInvitation(
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
  query getOrgInvitationLink($orgEntityId: ID!, $invitationLinkToken: String!) {
    getOrgInvitationLink(
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
    $orgEntityId: ID!
    $verification: JoinOrgVerification!
    $responsibility: String!
  ) {
    joinOrg(
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
