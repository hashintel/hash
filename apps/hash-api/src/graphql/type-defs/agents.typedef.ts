import { gql } from "apollo-server-express";

export const agentsTypedef = gql`
  scalar AgentTypeInput
  scalar AgentTypeOutput

  extend type Mutation {
    callAgentRunner(payload: AgentTypeInput!): AgentTypeOutput!
  }
`;
