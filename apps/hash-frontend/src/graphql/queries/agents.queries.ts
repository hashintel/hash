import { gql } from "@apollo/client";

export const callAgentRunnerMutation = gql`
  mutation callAgentRunner($payload: AgentTypeInput!) {
    callAgentRunner(payload: $payload)
  }
`;
