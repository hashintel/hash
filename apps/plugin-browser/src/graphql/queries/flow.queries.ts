export const getMinimalFlowRunsQuery = /* GraphQL */ `
  query getMinimalFlowRuns {
    getFlowRuns {
      totalCount
      flowRuns {
        name
        flowDefinitionId
        flowRunId
        webId
        status
        executedAt
        closedAt
        inputs
        inputRequests
        outputs
      }
    }
  }
`;
