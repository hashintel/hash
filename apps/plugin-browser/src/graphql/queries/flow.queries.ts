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
        executedAt
        closedAt
        flowInputs
        flowOutputs {
          outputName
          payload
        }
      }
    }
  }
`;
