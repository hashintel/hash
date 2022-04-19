import { gql } from "apollo-server-express";

export const executeTaskTypedef = gql`
  extend type Mutation {
    """
    Execute a the Demo Task
    """
    executeDemoTask: String!
  }
`;
