export const getMinimalFlowRunsQuery = /* GraphQL */ `
  query getMinimalFlowRuns {
    getFlowRuns {
      totalCount
      flowRuns {
        name
        flowDefinitionId
        flowRunEntityId
        webId
        status
        executedAt
        closedAt
        flowInputs
        inputRequests
        outputs
      }
    }
  }
`;
