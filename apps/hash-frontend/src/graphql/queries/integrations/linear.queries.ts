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

export const syncLinearIntegrationWithWebsMutation = gql`
  mutation syncLinearIntegrationWithWebs(
    $linearIntegrationEntityId: EntityId!
    $syncWithWebs: [SyncWithWeb!]!
  ) {
    syncLinearIntegrationWithWebs(
      linearIntegrationEntityId: $linearIntegrationEntityId
      syncWithWebs: $syncWithWebs
    )
  }
`;
