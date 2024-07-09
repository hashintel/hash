import { gql } from "@apollo/client";

export const startFlowMutation = gql`
  mutation startFlow(
    $dataSources: FlowDataSources!
    $flowTrigger: FlowTrigger!
    $flowDefinition: FlowDefinition!
    $webId: OwnedById!
  ) {
    startFlow(
      dataSources: $dataSources
      flowTrigger: $flowTrigger
      flowDefinition: $flowDefinition
      webId: $webId
    )
  }
`;
