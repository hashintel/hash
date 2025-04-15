export const createEntityMutation = /* GraphQL */ `
  mutation createEntity(
    $draft: Boolean!
    $entityTypeIds: [VersionedUrl!]!
    $linkedEntities: [LinkedEntityDefinition!]
    $webId: WebId!
    $properties: PropertyObjectWithMetadata!
    $linkData: LinkData
  ) {
    createEntity(
      draft: $draft
      entityTypeIds: $entityTypeIds
      linkedEntities: $linkedEntities
      webId: $webId
      properties: $properties
      linkData: $linkData
    )
  }
`;
