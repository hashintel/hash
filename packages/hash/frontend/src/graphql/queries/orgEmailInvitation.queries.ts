import { gql } from "@apollo/client";

export const getOrgEmailInvitation = gql`
  query getOrgEmailInvitation(
    $orgEntityId: ID!
    $invitationEmailToken: String!
  ) {
    getOrgEmailInvitation(
      orgEntityId: $orgEntityId
      invitationEmailToken: $invitationEmailToken
    ) {
      __typename
      entityId
      properties {
        org {
          data {
            properties {
              shortname
            }
          }
        }
        inviter {
          data {
            properties {
              preferredName
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
