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
