import { gql } from "@apollo/client";

export const startFlowMutation = gql`
  mutation startFlow(
    $dataSources: FlowDataSources
    $flowDefinition: FlowDefinition!
    $flowTrigger: FlowTrigger!
    $flowType: FlowType!
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
