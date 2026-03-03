import { gql } from "graphql-tag";

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

  input SyncWithWeb {
    """
    The linear team IDs to sync with the web
    """
    linearTeamIds: [ID!]!
    """
    The entity ID of the web (user or org)
    """
    webEntityId: EntityId!
  }

  extend type Mutation {
    """
    Sync linear integration with HASH webs (users or orgs)
    """
    syncLinearIntegrationWithWebs(
      linearIntegrationEntityId: EntityId!
      syncWithWebs: [SyncWithWeb!]!
    ): Entity
  }
`;
