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

export const updateEntityMutation = /* GraphQL */ `
  mutation updateEntity($entityUpdate: EntityUpdateDefinition!) {
    updateEntity(entityUpdate: $entityUpdate)
  }
`;
