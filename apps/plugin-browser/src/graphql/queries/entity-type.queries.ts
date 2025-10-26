export const queryEntityTypesQuery = /* GraphQL */ `
  query queryEntityTypes($request: QueryEntityTypesParams!) {
    queryEntityTypes(request: $request)
  }
`;

export const queryEntityTypeSubgraphQuery = /* GraphQL */ `
  query queryEntityTypeSubgraph($request: QueryEntityTypeSubgraphParams!) {
    queryEntityTypeSubgraph(request: $request)
  }
`;
