import { gql } from "apollo-server-express";

export const entityTypedef = gql`
  scalar EntityId
  scalar EntityRecordId
  scalar Entity
  scalar EntityPropertiesObject
  scalar EntityMetadata
  scalar EntityStructuralQuery
  scalar LinkData
  scalar QueryOperationInput
  scalar UserPermissions
  scalar UserPermissionsOnEntities

  type SubgraphAndPermissions {
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
    The type of the new entity.
    """
    entityTypeId: VersionedUrl
    """
    The properties of the new entity.
    """
    entityProperties: EntityPropertiesObject
    """
    Associated Entities to either create/get and link to this entity.
    """
    linkedEntities: [LinkedEntityDefinition!]
  }

  """
  The link metadata of a proposed entity.
  """
  type ProposedLinkData {
    # Keep this in sync with the LinkData type in apps/hash-ai-worker-py
    """
    The left entity id of the proposed link entity.
    """
    leftEntityId: Int!
    """
    The right entity id of the proposed link entity.
    """
    rightEntityId: Int!
  }

  """
  An entity proposed for creation. The suggested data can be used in further calls, e.g. to createEntity
  """
  type ProposedEntity {
    # Keep this in sync with the ProposedEntity type in apps/hash-ai-worker-py
    """
    The entity identifier.
    """
    entityId: EntityId!
    """
    The type of the proposed entity.
    """
    entityTypeId: VersionedUrl!
    """
    The suggested properties of the proposed entity.
    """
    properties: EntityPropertiesObject!
    """
    The link metadata of the entity, if this is proposed as a link entity
    """
    linkData: ProposedLinkData
  }

  """
  The result of an entity inference.
  """
  type InferEntitiesResult {
    # Keep this in sync with the InferEntitiesWorkflowResult type in apps/hash-ai-worker-py
    """
    The proposed entities.
    """
    entities: [ProposedEntity!]!
  }

  """
  The level of validation to apply to the inferred entities.
  """
  enum EntityValidation {
    # Keep this in sync with the EntityValidation type in apps/hash-ai-worker-py
    """
    The inferred entities are fully validated.
    """
    FULL
    """
    Full validation but does not error if a required field is missing or additional properties are specified.
    """
    PARTIAL
    """
    No validation performed.
    """
    NONE
  }

  enum EntityAuthorizationRelation {
    Owner
    Editor
    Viewer
  }

  type AccountGroupAuthorizationSubject {
    accountGroupId: AccountGroupId!
  }

  type AccountAuthorizationSubject {
    accountId: AccountId!
  }

  type PublicAuthorizationSubject {
    public: Boolean!
  }

  union EntityAuthorizationSubject =
      AccountGroupAuthorizationSubject
    | AccountAuthorizationSubject
    | PublicAuthorizationSubject

  type EntityAuthorizationRelationship {
    objectEntityId: EntityId!
    relation: EntityAuthorizationRelation!
    subject: EntityAuthorizationSubject!
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
    ): SubgraphAndPermissions!

    structuralQueryEntities(
      query: EntityStructuralQuery!
    ): SubgraphAndPermissions!

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
    ): SubgraphAndPermissions!

    isEntityPublic(entityId: EntityId!): Boolean!

    getEntityAuthorizationRelationships(
      entityId: EntityId!
    ): [EntityAuthorizationRelationship!]!

    checkUserPermissionsOnEntity(metadata: EntityMetadata!): UserPermissions!
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
      The type of the new entity.
      """
      entityTypeId: VersionedUrl!
      """
      The properties of the new entity.
      """
      properties: EntityPropertiesObject!
      """
      Associated Entities to either create or get, and then link to this entity.
      """
      linkedEntities: [LinkedEntityDefinition!]
      """
      The link metadata of the entity (required when creating a link entity).
      """
      linkData: LinkData
    ): Entity!

    """
    Update an entity.
    """
    updateEntity(
      """
      The id of the entity.
      """
      entityId: EntityId!
      """
      The updated properties of the entity.
      """
      updatedProperties: EntityPropertiesObject!
      """
      The updated left to right order of the link entity (if updating a link entity).
      """
      leftToRightOrder: Int
      """
      The updated right to left order of the link entity (if updating a link entity).
      """
      rightToLeftOrder: Int
      """
      The new type of the updated entity
      """
      entityTypeId: VersionedUrl
    ): Entity!

    """
    Archive an entity.
    """
    archiveEntity(
      """
      The id of the entity that will be archived.
      """
      entityId: EntityId!
    ): Boolean!

    """
    Propose entities which are inferred from an input.
    Does NOT persist the entities – callers are responsible for doing something with the proposed entities.
    """
    inferEntities(
      # Keep this in sync with the InferEntitiesWorkflowParameter type in apps/hash-ai-worker-py
      """
      A string of text to infer entities from, e.g. a page of text.
      """
      textInput: String!
      """
      The ids of the possible entity types that inferred entities may be of.
      """
      entityTypeIds: [VersionedUrl!]!
      """
      The model to use for inference.
      """
      model: String!
      """
      The maximum amount of tokens to generate. '0' means that the model's limit will be used.
      """
      maxTokens: Int!
      """
      Whether to allow empty results.
      """
      allowEmptyResults: Boolean!
      """
      The validation to apply to the inferred entities.
      """
      validation: EntityValidation!
      """
      The temperature to use for inference.
      """
      temperature: Float!
    ): InferEntitiesResult!

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
  }
`;
