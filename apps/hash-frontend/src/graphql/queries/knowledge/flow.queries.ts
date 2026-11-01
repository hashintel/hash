import { gql } from "@apollo/client";

export const startFlowMutation = gql`
  mutation startFlow(
    $dataSources: FlowDataSources
    $flowDefinitionEntityId: EntityId!
    $flowInputs: FlowInputValues!
    $webId: WebId!
  ) {
    startFlow(
      dataSources: $dataSources
      flowDefinitionEntityId: $flowDefinitionEntityId
      flowInputs: $flowInputs
      webId: $webId
    )
  }
`;

export const getFlowRunProgressQuery = gql`
  query getFlowRunProgress($flowRunEntityId: EntityId!, $after: String) {
    getFlowRunById(flowRunEntityId: $flowRunEntityId) {
      status
      outputs {
        outputName
        payload
      }
      failure {
        message
      }
      events(after: $after, first: 2000) {
        events
        endCursor
        hasNextPage
        restarted
      }
    }
  }
`;

export const resetFlowMutation = gql`
  mutation resetFlow(
    $flowRunEntityId: EntityId!
    $checkpointId: ID!
    $eventId: Int!
  ) {
    resetFlow(
      checkpointId: $checkpointId
      eventId: $eventId
      flowRunEntityId: $flowRunEntityId
    )
  }
`;

export const cancelFlowMutation = gql`
  mutation cancelFlow($flowRunEntityId: EntityId!) {
    cancelFlow(flowRunEntityId: $flowRunEntityId)
  }
`;

export const createFlowScheduleMutation = gql`
  mutation createFlowSchedule($input: CreateFlowScheduleInput!) {
    createFlowSchedule(input: $input)
  }
`;

export const pauseFlowScheduleMutation = gql`
  mutation pauseFlowSchedule($scheduleEntityId: EntityId!, $note: String) {
    pauseFlowSchedule(scheduleEntityId: $scheduleEntityId, note: $note)
  }
`;

export const resumeFlowScheduleMutation = gql`
  mutation resumeFlowSchedule($scheduleEntityId: EntityId!) {
    resumeFlowSchedule(scheduleEntityId: $scheduleEntityId)
  }
`;

export const archiveFlowScheduleMutation = gql`
  mutation archiveFlowSchedule($scheduleEntityId: EntityId!) {
    archiveFlowSchedule(scheduleEntityId: $scheduleEntityId)
  }
`;
