export const createEntityMutation = /* GraphQL */ `
  mutation createEntity(
    $entityTypeId: VersionedUrl!
    $properties: EntityPropertiesObject!
    $linkData: LinkData
  ) {
    createEntity(
      entityTypeId: $entityTypeId
      properties: $properties
      linkData: $linkData
    )
  }
`;
