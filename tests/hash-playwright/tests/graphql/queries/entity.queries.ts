export const createEntityMutation = /* GraphQL */ `
  mutation createEntity(
    $draft: Boolean!
    $entityTypeId: VersionedUrl!
    $linkedEntities: [LinkedEntityDefinition!]
    $ownedById: OwnedById!
    $properties: PropertyObjectWithMetadata!
    $linkData: LinkData
  ) {
    createEntity(
      draft: $draft
      entityTypeId: $entityTypeId
      linkedEntities: $linkedEntities
      ownedById: $ownedById
      properties: $properties
      linkData: $linkData
    )
  }
`;
