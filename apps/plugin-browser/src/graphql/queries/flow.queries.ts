export const getMinimalFlowRunsQuery = /* GraphQL */ `
  query getMinimalFlowRuns {
    getFlowRuns {
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
`;
