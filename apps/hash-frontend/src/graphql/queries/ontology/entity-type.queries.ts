import { gql } from "@apollo/client";

export const queryEntityTypesQuery = gql`
  query queryEntityTypes($request: QueryEntityTypesParams!) {
    queryEntityTypes(request: $request)
  }
`;

export const queryEntityTypeSubgraphQuery = gql`
  query queryEntityTypeSubgraph($request: QueryEntityTypeSubgraphParams!) {
    queryEntityTypeSubgraph(request: $request)
  }
`;

export const getClosedMultiEntityTypesQuery = gql`
  query getClosedMultiEntityTypes($request: GetClosedMultiEntityTypesParams!) {
    getClosedMultiEntityTypes(request: $request)
  }
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $webId: WebId!
    $entityType: ConstructEntityTypeParams!
  ) {
    # This is a scalar, which has no selection.
    createEntityType(webId: $webId, entityType: $entityType)
  }
`;

export const updateEntityTypeMutation = gql`
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

export const updateEntityTypesMutation = gql`
  mutation updateEntityTypes($updates: [EntityTypeUpdate!]!) {
    updateEntityTypes(updates: $updates)
  }
`;

export const archiveEntityTypeMutation = gql`
  mutation archiveEntityType($entityTypeId: VersionedUrl!) {
    archiveEntityType(entityTypeId: $entityTypeId)
  }
`;

export const unarchiveEntityTypeMutation = gql`
  mutation unarchiveEntityType($entityTypeId: VersionedUrl!) {
    unarchiveEntityType(entityTypeId: $entityTypeId)
  }
`;

export const checkUserPermissionsOnEntityTypeQuery = gql`
  query checkUserPermissionsOnEntityType($entityTypeId: VersionedUrl!) {
    checkUserPermissionsOnEntityType(entityTypeId: $entityTypeId)
  }
`;
