import { gql } from "@apollo/client";

export const getFlowRunsQuery = gql`
  query getFlowRuns($cursor: String, $limit: Int) {
    getFlowRuns(cursor: $cursor, limit: $limit) {
      totalCount
      nextCursor
      flowRuns {
        name
        flowDefinitionEntityId
        flowRunEntityId
        flowScheduleId
        webId
        status
        startedAt
        executedAt
        closedAt
        # For the goals list. Saved on a running run's Flow Run entity, so lists don't read the run's history.
        openInputRequests
      }
    }
  }
`;

export const getFlowRunById = gql`
  query getFlowRunById($flowRunEntityId: EntityId!) {
    getFlowRunById(flowRunEntityId: $flowRunEntityId) {
      name
      flowDefinitionEntityId
      flowRunEntityId
      flowScheduleId
      webId
      status
      startedAt
      executedAt
      closedAt
      flowInputs
      dataSources
      outputs {
        outputName
        payload
      }
      failure {
        message
      }
    }
  }
`;

export const getFlowRunEventsQuery = gql`
  query getFlowRunEvents(
    $flowRunEntityId: EntityId!
    $after: String
    $first: Int
  ) {
    getFlowRunById(flowRunEntityId: $flowRunEntityId) {
      flowRunEntityId
      events(after: $after, first: $first) {
        endCursor
        hasNextPage
        runId
        restarted
        keptUpTo
        events
      }
    }
  }
`;

export const submitExternalInputResponseMutation = gql`
  mutation submitExternalInputResponse(
    $flowRunEntityId: EntityId!
    $response: ExternalInputResponseWithoutUser!
  ) {
    submitExternalInputResponse(
      flowRunEntityId: $flowRunEntityId
      response: $response
    )
  }
`;
