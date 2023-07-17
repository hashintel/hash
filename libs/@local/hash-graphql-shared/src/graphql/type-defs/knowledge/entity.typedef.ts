import { gql } from "apollo-server-express";

export const entityTypedef = gql`
  scalar EntityId
  scalar EntityRecordId
  scalar Entity
  scalar EntityPropertiesObject
  scalar EntityMetadata
  scalar LinkData
  scalar QueryOperationInput

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
  An entity proposed for creation. The suggested data can be used in further calls, e.g. to createEntity
  """
  type ProposedEntity {
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
    linkData: LinkData
  }

  type InferEntitiesResult {
    entities: [ProposedEntity!]!
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
      isOfType: OutgoingEdgeResolveDepthInput!
      hasLeftEntity: EdgeResolveDepthsInput!
      hasRightEntity: EdgeResolveDepthsInput!
    ): Subgraph!

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
      isOfType: OutgoingEdgeResolveDepthInput!
      hasLeftEntity: EdgeResolveDepthsInput!
      hasRightEntity: EdgeResolveDepthsInput!
    ): Subgraph!
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
      """
      A string of text to infer entities from, e.g. a page of text.
      """
      textInput: String!
      """
      The ids of the possible entity types that inferred entities may be of.
      """
      entityTypeIds: [VersionedUrl!]!
    ): InferEntitiesResult!
  }
`;
