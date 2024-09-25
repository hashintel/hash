export const createEntityMutation = /* GraphQL */ `
  mutation createEntity(
    $draft: Boolean!
    $entityTypeIds: [VersionedUrl!]!
    $linkedEntities: [LinkedEntityDefinition!]
    $ownedById: OwnedById!
    $properties: PropertyObjectWithMetadata!
    $linkData: LinkData
  ) {
    createEntity(
      draft: $draft
      entityTypeIds: $entityTypeIds
      linkedEntities: $linkedEntities
      ownedById: $ownedById
      properties: $properties
      linkData: $linkData
    )
  }
`;
