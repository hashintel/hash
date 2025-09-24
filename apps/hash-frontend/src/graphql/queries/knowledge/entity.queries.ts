import { gql } from "@apollo/client";

export const createEntityMutation = gql`
  mutation createEntity(
    $entityTypeIds: [VersionedUrl!]!
    $webId: WebId
    $properties: PropertyObjectWithMetadata!
    $linkData: LinkData
    $draft: Boolean
    $relationships: [EntityRelationAndSubject!]
  ) {
    # This is a scalar, which has no selection.
    createEntity(
      entityTypeIds: $entityTypeIds
      webId: $webId
      properties: $properties
      linkData: $linkData
      draft: $draft
      relationships: $relationships
    )
  }
`;

export const queryEntitySubgraphQuery = gql`
  query queryEntitySubgraph($request: QueryEntitySubgraphRequest!) {
    queryEntitySubgraph(request: $request)
  }
`;

export const countEntitiesQuery = gql`
  query countEntities($request: CountEntitiesParams!) {
    countEntities(request: $request)
  }
`;

export const updateEntityMutation = gql`
  mutation updateEntity($entityUpdate: EntityUpdateDefinition!) {
    # This is a scalar, which has no selection.
    updateEntity(entityUpdate: $entityUpdate)
  }
`;

export const updateEntitiesMutation = gql`
  mutation updateEntities($entityUpdates: [EntityUpdateDefinition!]!) {
    updateEntities(entityUpdates: $entityUpdates)
  }
`;

export const archiveEntityMutation = gql`
  mutation archiveEntity($entityId: EntityId!) {
    archiveEntity(entityId: $entityId)
  }
`;

export const archiveEntitiesMutation = gql`
  mutation archiveEntities($entityIds: [EntityId!]!) {
    archiveEntities(entityIds: $entityIds)
  }
`;

export const addEntityOwnerMutation = gql`
  mutation addEntityOwner(
    $entityId: EntityId!
    $owner: AuthorizationSubjectId!
  ) {
    addEntityOwner(entityId: $entityId, owner: $owner)
  }
`;

export const removeEntityOwnerMutation = gql`
  mutation removeEntityOwner(
    $entityId: EntityId!
    $owner: AuthorizationSubjectId!
  ) {
    removeEntityOwner(entityId: $entityId, owner: $owner)
  }
`;

export const addEntityEditorMutation = gql`
  mutation addEntityEditor(
    $entityId: EntityId!
    $editor: AuthorizationSubjectId!
  ) {
    addEntityEditor(entityId: $entityId, editor: $editor)
  }
`;

export const removeEntityEditorMutation = gql`
  mutation removeEntityEditor(
    $entityId: EntityId!
    $editor: AuthorizationSubjectId!
  ) {
    removeEntityEditor(entityId: $entityId, editor: $editor)
  }
`;

export const addEntityViewerMutation = gql`
  mutation addEntityViewer(
    $entityId: EntityId!
    $viewer: AuthorizationViewerInput!
  ) {
    addEntityViewer(entityId: $entityId, viewer: $viewer)
  }
`;

export const removeEntityViewerMutation = gql`
  mutation removeEntityViewer(
    $entityId: EntityId!
    $viewer: AuthorizationViewerInput!
  ) {
    removeEntityViewer(entityId: $entityId, viewer: $viewer)
  }
`;

export const isEntityPublicQuery = gql`
  query isEntityPublic($entityId: EntityId!) {
    isEntityPublic(entityId: $entityId)
  }
`;

export const getEntityAuthorizationRelationshipsQuery = gql`
  query getEntityAuthorizationRelationships($entityId: EntityId!) {
    getEntityAuthorizationRelationships(entityId: $entityId) {
      objectEntityId
      relation
      subject {
        ... on AccountGroupAuthorizationSubject {
          __typename
          accountGroupId
        }
        ... on AccountAuthorizationSubject {
          __typename
          accountId
        }
        ... on PublicAuthorizationSubject {
          __typename
          public
        }
      }
    }
  }
`;

export const getEntityDiffsQuery = gql`
  query getEntityDiffs($inputs: [DiffEntityInput!]!) {
    getEntityDiffs(inputs: $inputs) {
      input
      diff
    }
  }
`;

export const validateEntityQuery = gql`
  query validateEntity(
    $components: ValidateEntityParamsComponents!
    $entityTypes: [VersionedUrl!]!
    $properties: PropertyObjectWithMetadata!
  ) {
    validateEntity(
      components: $components
      entityTypes: $entityTypes
      properties: $properties
    )
  }
`;
