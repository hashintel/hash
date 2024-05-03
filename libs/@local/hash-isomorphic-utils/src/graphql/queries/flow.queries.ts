import { gql } from "@apollo/client";

export const getFlowRunsQuery = gql`
  query getFlowRuns {
    getFlowRuns {
      flowDefinitionId
      workflowId
      runId
      status
      startedAt
      executedAt
      closedAt
      inputRequests
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
