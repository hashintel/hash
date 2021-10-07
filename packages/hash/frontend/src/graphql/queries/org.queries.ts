import { gql } from "@apollo/client";

export const createOrg = gql`
  mutation createOrg($org: CreateOrgInput!, $responsibility: String!) {
    createOrg(org: $org, responsibility: $responsibility) {
      __typename
      id
      createdById
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
