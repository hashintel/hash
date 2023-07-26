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

  extend type Query {
    """
    Get the linear teams in a linear org
    """
    linearTeams(linearOrgId: ID!): [LinearTeam!]!
  }
`;
