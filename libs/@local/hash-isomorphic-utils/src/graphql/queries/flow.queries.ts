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
        # For the goals list. Both read the history of a run that hasn't closed.
        lastActivityAt
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
      flowOutputs {
        outputName
        payload
      }
      failure {
        message
        code
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
