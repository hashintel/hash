import { gql } from "@apollo/client";

export const getFlowRunsQuery = gql`
  query getFlowRuns {
    getFlowRuns {
      flowDefinitionId
      flowRunId
      webId
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

export const submitExternalInputResponseMutation = gql`
  mutation submitExternalInputResponse(
    $flowUuid: ID!
    $response: ExternalInputResponseSignal!
  ) {
    submitExternalInputResponse(flowUuid: $flowUuid, response: $response)
  }
`;
