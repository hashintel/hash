import { gql } from "apollo-server-express";

export const entityWithMetadataTypedef = gql`
  scalar EntityId
  scalar EntityEditionId
  """
  @todo rename to 'Entity' once we get rid of deprecated GQL types.
    See https://app.asana.com/0/1201095311341924/1203411297593704/f
  """
  scalar EntityWithMetadata
  """
  @todo we intend to use only a single scalar instead of the following ones.
    To support existing pieces of the application, these scalars are useful for 'Knowledge' types
    that wrap entities with custom resolvers.
    Changing this this can be considered part of https://app.asana.com/0/1202805690238892/1203157172269854/f
  """
  scalar PropertyObject
  scalar EntityMetadata

  input PersistedLinkedEntityDefinition {
    destinationAccountId: ID!
    linkEntityTypeId: VersionedUri!
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
    entityTypeId: VersionedUri
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
    getAllLatestEntitiesWithMetadata(
      dataTypeResolveDepth: Int!
      propertyTypeResolveDepth: Int!
      entityTypeResolveDepth: Int!
      entityResolveDepth: Int!
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
      entityTypeResolveDepth: Int!
      entityResolveDepth: Int!
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
      entityTypeId: VersionedUri!
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
