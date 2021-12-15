import { gql } from "@apollo/client";

export const createOrg = gql`
  mutation createOrg($org: CreateOrgInput!, $responsibility: String!) {
    createOrg(org: $org, responsibility: $responsibility) {
      __typename
      id
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
          data {
            properties {
              responsibility
              org {
                data {
                  entityId
                }
              }
            }
          }
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
        org {
          data {
            properties {
              name
              shortname
            }
          }
        }
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
        org {
          data {
            properties {
              name
            }
          }
        }
        inviter {
          data {
            entityId
            properties {
              preferredName
            }
          }
        }
        inviteeEmailAddress
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
      properties {
        org {
          data {
            entityId
            properties {
              name
            }
          }
        }
      }
    }
  }
`;
