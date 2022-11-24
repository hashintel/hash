import { gql } from "apollo-server-express";

export const entityTypedef = gql`
  scalar EntityId
  scalar EntityEditionId
  """
  @todo rename to 'Entity' once we get rid of deprecated GQL types.
    See https://app.asana.com/0/1201095311341924/1203411297593704/f
  """
  scalar Entity
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
    entity: EntityDefinition!
  }

  input EntityDefinition {
    """
    The EntityId of the existing entity to use instead of creating a new entity.
    This may be a reference to a placeholder set using placeholderId on a previous UpdatePageContentsAction.
    """
    existingEntityId: EntityId
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

  # TODO: rename these and remove "withMetadata" - https://app.asana.com/0/0/1203157172269854/f
  extend type Query {
    """
    Get a subgraph rooted at all entities at their latest version.
    """
    getAllLatestEntities(
      dataTypeResolveDepth: Int!
      propertyTypeResolveDepth: Int!
      entityTypeResolveDepth: Int!
      entityResolveDepth: Int!
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
    createEntity(
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
      updatedProperties: JSONObject!
    ): Entity!
  }
`;
