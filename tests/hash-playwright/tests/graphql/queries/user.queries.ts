export const meQuery = /* GraphQL */ `
  query me {
    me {
      subgraph {
        roots
        vertices
        edges
        temporalAxes
      }
    }
  }
`;
