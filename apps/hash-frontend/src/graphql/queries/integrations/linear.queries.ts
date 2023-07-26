import { gql } from "@apollo/client";

export const getLinearOrganizationQuery = gql`
  query getLinearOrganization($linearOrgId: ID!) {
    getLinearOrganization(linearOrgId: $linearOrgId) {
      id
      logoUrl
      name
      teams {
        id
        name
        description
        color
        icon
        private
      }
    }
  }
`;
