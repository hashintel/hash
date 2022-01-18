import { gql } from "@apollo/client";

export const createOrg = gql`
  mutation createOrg($org: CreateOrgInput!, $responsibility: String!) {
    createOrg(org: $org, responsibility: $responsibility) {
      __typename
      createdByAccountId
      createdAt
      updatedAt
      accountId
      entityId
      entityTypeId
      entityTypeVersionId
      entityTypeName
      visibility
      properties {
        shortname
      }
      invitationLinks {
        entityId
        properties {
          accessToken
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
        emails {
          address
          verified
          primary
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
      entityId
      properties {
        inviteeEmailAddress
      }
    }
  }
`;

export const getOrgEmailInvitation = gql`
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
        inviteeEmailAddress
      }
      org {
        entityId
        properties {
          name
        }
      }
      inviter {
        entityId
        properties {
          preferredName
        }
      }
    }
  }
`;

export const getOrgInvitationLink = gql`
  query getOrgInvitationLink($orgEntityId: ID!, $invitationLinkToken: String!) {
    getOrgInvitationLink(
      orgEntityId: $orgEntityId
      invitationLinkToken: $invitationLinkToken
    ) {
      entityId

      org {
        entityId
        properties {
          name
        }
      }
    }
  }
`;
