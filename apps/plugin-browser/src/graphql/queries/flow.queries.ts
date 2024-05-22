export const getMinimalFlowRunsQuery = /* GraphQL */ `
  query getMinimalFlowRuns {
    getFlowRuns {
      flowDefinitionId
      flowRunId
      status
      executedAt
      closedAt
      inputs
      inputRequests
      outputs
    }
  }
`;
