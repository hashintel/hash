import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const createEntityMutation = gql`
  mutation createEntity(
    $entityTypeId: VersionedUrl!
    $ownedById: OwnedById
    $properties: EntityPropertiesObject!
    $linkData: LinkData
  ) {
    # This is a scalar, which has no selection.
    createEntity(
      entityTypeId: $entityTypeId
      ownedById: $ownedById
      properties: $properties
      linkData: $linkData
    )
  }
`;

export const queryEntitiesQuery = gql`
  query queryEntities(
    $operation: QueryOperationInput!
    $constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    $constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinksOn: OutgoingEdgeResolveDepthInput!
    $constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    $includePermissions: Boolean!
    $inheritsFrom: OutgoingEdgeResolveDepthInput!
    $isOfType: OutgoingEdgeResolveDepthInput!
    $hasLeftEntity: EdgeResolveDepthsInput!
    $hasRightEntity: EdgeResolveDepthsInput!
  ) {
    queryEntities(
      operation: $operation
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
      constrainsLinkDestinationsOn: $constrainsLinkDestinationsOn
      inheritsFrom: $inheritsFrom
      isOfType: $isOfType
      hasLeftEntity: $hasLeftEntity
      hasRightEntity: $hasRightEntity
    ) {
      userPermissionsOnEntities @include(if: $includePermissions)
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${subgraphFieldsFragment}
`;

export const structuralQueryEntitiesQuery = gql`
  query structuralQueryEntities(
    $query: EntityStructuralQuery!
    $includePermissions: Boolean!
  ) {
    structuralQueryEntities(query: $query) {
      userPermissionsOnEntities @include(if: $includePermissions)
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${subgraphFieldsFragment}
`;

export const updateEntityMutation = gql`
  mutation updateEntity(
    $entityId: EntityId!
    $updatedProperties: EntityPropertiesObject!
    $leftToRightOrder: Int
    $rightToLeftOrder: Int
    $entityTypeId: VersionedUrl
  ) {
    # This is a scalar, which has no selection.
    updateEntity(
      entityId: $entityId
      updatedProperties: $updatedProperties
      leftToRightOrder: $leftToRightOrder
      rightToLeftOrder: $rightToLeftOrder
      entityTypeId: $entityTypeId
    )
  }
`;

export const archiveEntityMutation = gql`
  mutation archiveEntity($entityId: EntityId!) {
    archiveEntity(entityId: $entityId)
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
