import { gql } from "apollo-server-express";

export const entityTypedef = gql`
  scalar ClosedMultiEntityTypesRootMap
  scalar ClosedMultiEntityTypesDefinitions
  scalar EntityId
  scalar EntityMetadata
  scalar EntityRecordId
  scalar EntityRelationAndSubject
  scalar GetEntitySubgraphRequest
  scalar LinkData
  scalar PropertyObject
  scalar PropertyObjectWithMetadata
  scalar PropertyPatchOperation
  scalar QueryOperationInput
  scalar SerializedEntity
  scalar UserPermissions
  scalar UserPermissionsOnEntities
  scalar ValidateEntityParamsComponents

  type SubgraphAndPermissions {
    userPermissionsOnEntities: UserPermissionsOnEntities!
    subgraph: Subgraph!
  }

  type GetEntitySubgraphResponse {
    count: Int
    closedMultiEntityTypes: ClosedMultiEntityTypesRootMap
    definitions: ClosedMultiEntityTypesDefinitions
    userPermissionsOnEntities: UserPermissionsOnEntities!
    subgraph: Subgraph!
  }

  input LinkedEntityDefinition {
    destinationAccountId: AccountId!
    linkEntityTypeId: VersionedUrl!
    """
    The index of the link (if any)
    """
    index: Int
    entity: EntityDefinition!
  }

  input EntityDefinition {
    """
    The EntityId of the existing entity to use instead of creating a new entity.
    This may be a reference to a placeholder set using placeholderId on a previous UpdatePageContentsAction.
    """
    existingEntityId: EntityId
    """
    The type(s) of the new entity.
    """
    entityTypeIds: [VersionedUrl!]
    """
    The properties of the new entity.
    """
    entityProperties: PropertyObjectWithMetadata
    """
    Associated Entities to either create/get and link to this entity.
    """
    linkedEntities: [LinkedEntityDefinition!]
  }

  enum EntityAuthorizationRelation {
    Owner
    Editor
    Viewer
  }

  enum AccountGroupAuthorizationSubjectRelation {
    Member
  }

  type AccountGroupAuthorizationSubject {
    accountGroupId: AccountGroupId!
    relation: AccountGroupAuthorizationSubjectRelation
  }

  type AccountAuthorizationSubject {
    accountId: AccountId!
  }

  type PublicAuthorizationSubject {
    public: Boolean!
  }

  union EntityAuthorizationSubject =
    | AccountGroupAuthorizationSubject
    | AccountAuthorizationSubject
    | PublicAuthorizationSubject

  type EntityAuthorizationRelationship {
    objectEntityId: EntityId!
    relation: EntityAuthorizationRelation!
    subject: EntityAuthorizationSubject!
  }

  scalar DiffEntityInput
  scalar DiffEntityResult

  type EntityDiff {
    input: DiffEntityInput!
    diff: DiffEntityResult!
  }

  extend type Query {
    """
    Implementation of the Block Protocol queryEntities hook
    """
    queryEntities(
      """
      Filter root entities by their entity type ID (optional)
      """
      operation: QueryOperationInput!
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
      inheritsFrom: OutgoingEdgeResolveDepthInput!
      isOfType: OutgoingEdgeResolveDepthInput!
      hasLeftEntity: EdgeResolveDepthsInput!
      hasRightEntity: EdgeResolveDepthsInput!
      includeDrafts: Boolean
    ): SubgraphAndPermissions!

    getEntitySubgraph(
      request: GetEntitySubgraphRequest!
    ): GetEntitySubgraphResponse!

    """
    Get a subgraph rooted at an entity resolved by its id.
    """
    getEntity(
      """
      The id of the entity.
      """
      entityId: EntityId!
      """
      The version of the entity. Defaults to the latest version.
      """
      entityVersion: String
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
      inheritsFrom: OutgoingEdgeResolveDepthInput!
      isOfType: OutgoingEdgeResolveDepthInput!
      hasLeftEntity: EdgeResolveDepthsInput!
      hasRightEntity: EdgeResolveDepthsInput!
      includeDrafts: Boolean
    ): SubgraphAndPermissions!

    isEntityPublic(entityId: EntityId!): Boolean!

    getEntityAuthorizationRelationships(
      entityId: EntityId!
    ): [EntityAuthorizationRelationship!]!

    checkUserPermissionsOnEntity(metadata: EntityMetadata!): UserPermissions!

    getEntityDiffs(inputs: [DiffEntityInput!]!): [EntityDiff!]!

    """
    Validates the requested aspects of an entity

    Throws an error if the entity is invalid, with an object containing the invalid properties.

    Returns 'true' if the entity is valid
    """
    validateEntity(
      """
      Which aspects of the entity to validate:
      - linkData: validates that linkData is present if an entity is a link, or is absent if it isn't. Default: false if draft
      - linkValidation: validates that the link target is valid for the source type(s). Default: true
      - numItems: that the min/max number of items in a property array is respected.
      - requiredProperties: whether or not the required properties are present
      """
      components: ValidateEntityParamsComponents!
      """
      The proposed entity types for the entity
      """
      entityTypes: [VersionedUrl!]!
      """
      The proposed properties for the entity
      """
      properties: PropertyObjectWithMetadata!
    ): Boolean!
  }

  enum AuthorizationSubjectKind {
    Public
    Account
    AccountGroup
  }

  input AuthorizationViewerInput {
    viewer: AuthorizationSubjectId
    kind: AuthorizationSubjectKind!
  }

  input EntityUpdateDefinition {
    """
    The id of the entity.
    """
    entityId: EntityId!
    """
    The patch operations to apply to the entity's properties
    """
    propertyPatches: [PropertyPatchOperation!]!
    """
    The new type(s) of the updated entity
    """
    entityTypeIds: [VersionedUrl!]
    """
    Whether the updated entity should be a draft
    """
    draft: Boolean
  }

  extend type Mutation {
    """
    Create an entity.
    """
    createEntity(
      """
      The owner of the created entity. Defaults to the user calling the mutation.
      """
      ownedById: OwnedById
      """
      The type(s) of the new entity.
      """
      entityTypeIds: [VersionedUrl!]!
      """
      The properties of the new entity.
      """
      properties: PropertyObjectWithMetadata!
      """
      Associated Entities to either create or get, and then link to this entity.
      """
      linkedEntities: [LinkedEntityDefinition!]
      """
      The link metadata of the entity (required when creating a link entity).
      """
      linkData: LinkData
      """
      Whether the created entity should be a draft
      """
      draft: Boolean
      """
      Set the permission relations on the entity
      """
      relationships: [EntityRelationAndSubject!]
    ): SerializedEntity!

    """
    Update an entity.
    """
    updateEntity(entityUpdate: EntityUpdateDefinition!): SerializedEntity!

    """
    Update multiple entities.
    """
    updateEntities(entityUpdates: [EntityUpdateDefinition!]!): SerializedEntity!

    """
    Archive an entity.
    """
    archiveEntity(
      """
      The ID of the entity that will be archived.
      """
      entityId: EntityId!
    ): Boolean!

    """
    Archive multiple entities. If archiving any entity fails, any successfully archived
    entities will be un-archived.
    """
    archiveEntities(
      """
      The IDs of the entities that will be archived.
      """
      entityIds: [EntityId!]!
    ): Boolean!

    addEntityOwner(
      entityId: EntityId!
      owner: AuthorizationSubjectId!
    ): Boolean!

    removeEntityOwner(
      entityId: EntityId!
      owner: AuthorizationSubjectId!
    ): Boolean!

    addEntityEditor(
      entityId: EntityId!
      editor: AuthorizationSubjectId!
    ): Boolean!

    removeEntityEditor(
      entityId: EntityId!
      editor: AuthorizationSubjectId!
    ): Boolean!

    addEntityViewer(
      entityId: EntityId!
      viewer: AuthorizationViewerInput!
    ): Boolean!

    removeEntityViewer(
      entityId: EntityId!
      viewer: AuthorizationViewerInput!
    ): Boolean!

    addAccountGroupMember(
      accountGroupId: AccountGroupId!
      accountId: AccountId!
    ): Boolean!

    removeAccountGroupMember(
      accountGroupId: AccountGroupId!
      accountId: AccountId!
    ): Boolean!
  }
`;
