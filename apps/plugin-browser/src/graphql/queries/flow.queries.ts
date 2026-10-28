export const getMinimalFlowRunsQuery = /* GraphQL */ `
  query getMinimalFlowRuns {
    getFlowRuns {
      totalCount
      flowRuns {
        name
        flowDefinitionEntityId
        flowRunEntityId
        webId
        status
        startedAt
        closedAt
        flowInputs
      }
    }
  }
`;

export const getFlowRunOutputsQuery = /* GraphQL */ `
  query getFlowRunOutputs($flowRunEntityId: EntityId!) {
    getFlowRunById(flowRunEntityId: $flowRunEntityId) {
      outputs {
        outputName
        payload
      }
    }
  }
`;
