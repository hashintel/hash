export const meQuery = /* GraphQL */ `
  query me {
    me(
      hasLeftEntity: { incoming: 0, outgoing: 0 }
      hasRightEntity: { incoming: 0, outgoing: 0 }
    ) {
      subgraph {
        roots
        vertices
        edges
        temporalAxes
      }
    }
  }
`;
