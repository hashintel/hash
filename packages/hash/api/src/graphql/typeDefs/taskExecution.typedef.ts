import { gql } from "apollo-server-express";

export const executeTaskTypedef = gql`
  extend type Mutation {
    """
    Execute the Demo Task
    """
    executeDemoTask: String!

    """
    Call the Github Integration Spec Task
    """
    executeGithubSpecTask: String!
    """
    Call the Github Integration Check Task
    """
    executeGithubCheckTask: String!
  }
`;
