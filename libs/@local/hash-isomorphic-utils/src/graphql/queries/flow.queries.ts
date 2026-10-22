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
  }
`;

export const getFlowRunById = gql`
  query getFlowRunById($flowRunEntityId: EntityId!) {
    getFlowRunById(flowRunEntityId: $flowRunEntityId) {
      name
      flowDefinitionEntityId
      flowRunEntityId
      flowScheduleId
      failureMessage
      webId
      status
      startedAt
      executedAt
      closedAt
      inputRequests
      flowInputs
      dataSources
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
        events {
          __typename
          position
          occurredAt
          ... on FlowRunStartedEvent {
            flowInputs
          }
          ... on FlowRunStepStartedEvent {
            stepRun {
              stepId
              itemPath
            }
            stepType
            inputs
          }
          ... on FlowRunAttemptStartedEvent {
            stepRun {
              stepId
              itemPath
            }
            attempt
            hiddenAttempts {
              count
              lastError {
                message
              }
            }
          }
          ... on FlowRunAttemptSucceededEvent {
            stepRun {
              stepId
              itemPath
            }
            attempt
            outputs
            message
          }
          ... on FlowRunAttemptFailedEvent {
            stepRun {
              stepId
              itemPath
            }
            attempt
            error {
              message
            }
            retrying
          }
          ... on FlowRunStepGaveUpEvent {
            stepRun {
              stepId
              itemPath
            }
            attempt
            reason
          }
          ... on FlowRunAttemptCancellationRequestedEvent {
            stepRun {
              stepId
              itemPath
            }
          }
          ... on FlowRunAttemptCancelledEvent {
            stepRun {
              stepId
              itemPath
            }
          }
          ... on FlowRunStepSkippedEvent {
            stepRun {
              stepId
              itemPath
            }
            stepType
          }
          ... on FlowRunForEachStartedEvent {
            stepRun {
              stepId
              itemPath
            }
            itemCount
          }
          ... on FlowRunInputRequestedEvent {
            stepRun {
              stepId
              itemPath
            }
            request
          }
          ... on FlowRunInputResolvedEvent {
            requestStepRun {
              stepId
              itemPath
            }
            requestId
            response
          }
          ... on FlowRunProgressLoggedEvent {
            stepRun {
              stepId
              itemPath
            }
            loggedInAttempt
            log
          }
          ... on FlowRunResetEvent {
            fromRunId
          }
          ... on FlowRunFinishedEvent {
            status
            flowOutputs
            failure {
              message
            }
            stepErrors {
              stepRun {
                stepId
                itemPath
              }
              error {
                message
              }
            }
          }
        }
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
