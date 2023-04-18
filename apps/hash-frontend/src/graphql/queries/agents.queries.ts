import { gql } from "@apollo/client";

export const callAgentQuery = gql`
  query callAgent($payload: AgentTypeInput!) {
    callAgent(payload: $payload)
  }
`;
