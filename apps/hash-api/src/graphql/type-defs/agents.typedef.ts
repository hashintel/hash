import { gql } from "apollo-server-express";

export const agentsTypedef = gql`
  scalar AgentTypeInput
  scalar AgentTypeOutput

  extend type Query {
    callAgent(payload: AgentTypeInput!): AgentTypeOutput!
  }
`;
