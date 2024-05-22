export const getMinimalFlowRunsQuery = /* GraphQL */ `
  query getMinimalFlowRuns {
    getFlowRuns {
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
`;
