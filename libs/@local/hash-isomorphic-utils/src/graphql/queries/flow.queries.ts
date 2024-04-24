import { gql } from "@apollo/client";

export const getFlowRunsQuery = gql`
  query getFlowRuns {
    getFlowRuns {
      flowDefinitionId
      runId
      status
      startedAt
      executedAt
      closedAt
      inputs
      outputs
      steps {
        stepId
        stepType
        status
        scheduledAt
        startedAt
        closedAt
        attempt
        lastFailure
        retryState
        inputs
        outputs
        logs
      }
    }
  }
`;
