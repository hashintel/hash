import { gql } from "apollo-server-express";

export const entityWithMetadataTypedef = gql`
  scalar EntityId
  scalar EntityEditionId
  scalar PropertyObject
  scalar EntityMetadata

  interface EntityWithMetadata {
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: PropertyObject!
  }

  type UnknownEntityWithMetadata implements EntityWithMetadata {
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: PropertyObject!
  }

  """
  Select entity types by ONE of componentId, entityTypeId
  """
  input EntityWithMetadataTypeChoice {
    # Previously the EntityTypeChoice included 'componentId: ID', which made it possible
    # to create a block using an already-existing entity type based on its componentId
    # we should reconsider what we do about the component ID
    # see https://app.asana.com/0/0/1202924026802716/f
    """
    A fixed entity type ID. This may be a reference to a placeholder set using a previous createEntityTypeAction.
    """
    entityTypeId: String
  }

  input PersistedLinkedEntityDefinition {
    destinationAccountId: ID!
    linkTypeId: String!
    """
    The index of the link (if any)
    """
    index: Int
    entity: EntityWithMetadataDefinition!
  }

  input EntityWithMetadataDefinition {
    """
    Existing Entity to use instead of creating a new entity.
    """
    existingEntity: EntityId
    """
    The type of which to instantiate the new entity.
    """
    entityType: EntityTypeWithMetadata
    """
    The properties of new entity.
    """
    entityProperties: JSONObject
    """
    Associated Entities to either create/get and link to this entity.
    """
    linkedEntities: [PersistedLinkedEntityDefinition!]
  }

  # TODO: rename these and remove "persisted" - https://app.asana.com/0/0/1203157172269854/f
  extend type Query {
    """
    Get a subgraph rooted at all entities at their latest version.
    """
    getAllLatestPersistedEntities(
      dataTypeResolveDepth: Int!
      propertyTypeResolveDepth: Int!
      linkTypeResolveDepth: Int!
      entityTypeResolveDepth: Int!
      linkTargetEntityResolveDepth: Int!
      linkResolveDepth: Int!
    ): Subgraph!

    """
    Get a subgraph rooted at an entity resolved by its id.
    """
    getEntityWithMetadata(
      """
      The id of the entity.
      """
      entityId: ID!
      """
      The version of the entity. Defaults to the latest version.
      """
      entityVersion: String
      dataTypeResolveDepth: Int!
      propertyTypeResolveDepth: Int!
      linkTypeResolveDepth: Int!
      entityTypeResolveDepth: Int!
      linkTargetEntityResolveDepth: Int!
      linkResolveDepth: Int!
    ): Subgraph!
  }

  extend type Mutation {
    """
    Create an entity.
    """
    createEntityWithMetadata(
      """
      The owner of the create entity. Defaults to the user calling the mutation.
      """
      ownedById: ID
      """
      The type of which to instantiate the new entity.
      """
      entityTypeId: ID!
      """
      The properties of new entity.
      """
      properties: JSONObject!
      """
      Associated Entities to either create/get and link to this entity.
      """
      linkedEntities: [PersistedLinkedEntityDefinition!]
    ): EntityWithMetadata!

    """
    Update an entity.
    """
    updateEntityWithMetadata(
      """
      The id of the entity.
      """
      entityId: ID!
      """
      The updated properties of the entity.
      """
      updatedProperties: JSONObject!
    ): EntityWithMetadata!
  }
`;
