export const createEntityTypeMutation = /* GraphQL */ `
  mutation createEntityType($entityType: ConstructEntityTypeParams!) {
    createEntityType(entityType: $entityType)
  }
`;

export const updateEntityTypeMutation = /* GraphQL */ `
  mutation updateEntityType(
    $entityTypeId: VersionedUrl!
    $updatedEntityType: ConstructEntityTypeParams!
  ) {
    updateEntityType(
      entityTypeId: $entityTypeId
      updatedEntityType: $updatedEntityType
    )
  }
`;
