import { gql } from "apollo-server-express";

export const linearTypedef = gql`
  type LinearTeam {
    id: ID!
    """
    The team's name.
    """
    name: String!
    """
    The team's description.
    """
    description: String
    """
    The team's color.
    """
    color: String
    """
    The icon of the team.
    """
    icon: String
    """
    Whether the team is private or not.
    """
    private: Boolean!
  }

  type LinearOrganization {
    """
    The unique identifier of the entity.
    """
    id: ID!
    """
    The organization's logo URL.
    """
    logoUrl: String
    """
    The organization's name.
    """
    name: String!
    """
    Teams associated with the organization.
    """
    teams: [LinearTeam!]!
  }

  extend type Query {
    """
    Get the linear organization
    """
    getLinearOrganization(linearOrgId: ID!): LinearOrganization!
  }

  input SyncWithWorkspace {
    """
    The linear team IDs to sync with the workspace
    """
    linearTeamIds: [ID!]!
    """
    The entity ID of the workspace (user or org)
    """
    workspaceEntityId: EntityId!
  }

  extend type Mutation {
    """
    Sync linear integration with HASH workspaces (users or orgs)
    """
    syncLinearIntegrationWithWorkspaces(
      linearIntegrationEntityId: EntityId!
      syncWithWorkspaces: [SyncWithWorkspace!]!
    ): Entity
  }
`;
