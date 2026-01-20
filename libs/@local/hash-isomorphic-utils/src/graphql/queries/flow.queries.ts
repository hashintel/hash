import { gql } from "@apollo/client";

export const getFlowRunsQuery = gql`
  query getFlowRuns {
    getFlowRuns {
      name
      flowDefinitionId
      flowRunId
      flowScheduleId
      webId
      status
      startedAt
      executedAt
      closedAt
      # Requesting 'inputRequests' requires the API going through the event history for each flow run,
      # which ideally we would not have to do when requesting all flow runs.
      # This field is required to indicate goals which are pending input on the /goals page
      # @todo consider some way of caching a 'input requested' status to avoid this, e.g. on the Flow entity
      inputRequests
      # We need 'steps' to be able to populate the 'last event occurred at' field in a goals list,
      # Similarly to 'inputRequests', this involves going through the event history for each flow run
      steps {
        scheduledAt
        startedAt
        closedAt
        logs
      }
    }
  }
`;

export const getFlowRunById = gql`
  query getFlowRunById($flowRunId: String!) {
    getFlowRunById(flowRunId: $flowRunId) {
      name
      flowDefinitionId
      flowRunId
      flowScheduleId
      failureMessage
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
    $response: ExternalInputResponseWithoutUser!
  ) {
    submitExternalInputResponse(flowUuid: $flowUuid, response: $response)
  }
`;
