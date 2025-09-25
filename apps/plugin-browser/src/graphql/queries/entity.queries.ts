export const createEntityMutation = /* GraphQL */ `
  mutation createEntity(
    $entityTypeIds: [VersionedUrl!]!
    $properties: PropertyObjectWithMetadata!
    $linkData: LinkData
  ) {
    createEntity(
      entityTypeIds: $entityTypeIds
      properties: $properties
      linkData: $linkData
    )
  }
`;

export const updateEntityMutation = /* GraphQL */ `
  mutation updateEntity($entityUpdate: EntityUpdateDefinition!) {
    updateEntity(entityUpdate: $entityUpdate)
  }
`;

export const queryEntitySubgraphQuery = /* GraphQL */ `
  query queryEntitySubgraph($request: QueryEntitySubgraphRequest!) {
    queryEntitySubgraph(request: $request)
  }
`;
