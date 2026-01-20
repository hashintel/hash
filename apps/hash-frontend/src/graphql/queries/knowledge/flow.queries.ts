import { gql } from "@apollo/client";

export const startFlowMutation = gql`
  mutation startFlow(
    $dataSources: FlowDataSources
    $flowDefinition: FlowDefinition!
    $flowTrigger: FlowTrigger!
    $flowType: FlowTypeDataType!
    $webId: WebId!
  ) {
    startFlow(
      dataSources: $dataSources
      flowDefinition: $flowDefinition
      flowTrigger: $flowTrigger
      flowType: $flowType
      webId: $webId
    )
  }
`;

export const resetFlowMutation = gql`
  mutation resetFlow($flowUuid: ID!, $checkpointId: ID!, $eventId: Int!) {
    resetFlow(
      checkpointId: $checkpointId
      eventId: $eventId
      flowUuid: $flowUuid
    )
  }
`;

export const cancelFlowMutation = gql`
  mutation cancelFlow($flowUuid: ID!) {
    cancelFlow(flowUuid: $flowUuid)
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
