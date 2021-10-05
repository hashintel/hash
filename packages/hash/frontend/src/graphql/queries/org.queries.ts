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
