import { gql } from "apollo-server-express";

export const persistedEntityTypedef = gql`
  interface PersistedEntity {
    # These fields are repeated everywhere they're used because
    # (a) GQL requires it - https://github.com/graphql/graphql-spec/issues/533
    # (b) string interpolation breaks the code generator's introspection
    #
    # Could maybe use a custom schema loader to parse it ourselves:
    # https://www.graphql-code-generator.com/docs/getting-started/schema-field#custom-schema-loader
    #
    # For now, _COPY ANY CHANGES_ from here to any type that 'implements Entity'
    """
    The id of the entity
    """
    entityId: ID!
    """
    The specific version of the entity
    """
    entityVersion: String!
    """
    The id of the account that owns this entity.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this entity.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    """
    The versioned URI of this entity's type.
    """
    entityTypeId: String!
    """
    The full entity type definition.
    """
    entityType: PersistedEntityType!
    """
    The linked entities of the entity.
    """
    linkedEntities: [PersistedEntity!]!
    """
    The JSON object containing the entity's properties.
    """
    properties: JSONObject!
  }

  type UnknownPersistedEntity implements PersistedEntity {
    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    entityId: ID!
    """
    The specific version of the entity
    """
    entityVersion: String!
    """
    The id of the account that owns this entity.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this entity.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    """
    The versioned URI of this entity's type.
    """
    entityTypeId: String!
    """
    The full entity type definition.
    """
    entityType: PersistedEntityType!
    """
    The linked entities of the entity.
    """
    linkedEntities: [PersistedEntity!]!
    """
    The JSON object containing the entity's properties.
    """
    properties: JSONObject!
    # ENTITY INTERFACE FIELDS END #
  }

  """
  For referring to an existing entity owned by a specific account id
  """
  input PersistedExistingEntity {
    """
    This may be a reference to a placeholder set using placeholderId on a previous UpdatePageContentsAction.
    """
    entityId: ID!
    ownedById: ID!
  }

  """
  Select entity types by ONE of componentId, entityTypeId
  """
  input PersistedEntityTypeChoice {
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
    entity: PersistedEntityDefinition!
  }

  input PersistedEntityDefinition {
    """
    Existing Entity to use instead of creating a new entity.
    """
    existingEntity: PersistedExistingEntity
    """
    The type of which to instantiate the new entity.
    """
    entityType: PersistedEntityTypeChoice
    """
    The properties of new entity.
    """
    entityProperties: JSONObject
    """
    Associated Entities to either create/get and link to this entity.
    """
    linkedEntities: [PersistedLinkedEntityDefinition!]
  }

  extend type Query {
    """
    Get an entity.
    """
    persistedEntity(
      """
      The id of the entity.
      """
      entityId: ID!
      """
      The version of the entity. Defaults to the latest version.
      """
      entityVersion: String
    ): PersistedEntity!
  }

  extend type Mutation {
    """
    Create an entity.
    """
    createPersistedEntity(
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
    ): UnknownPersistedEntity!

    """
    Update an entity.
    """
    updatePersistedEntity(
      """
      The id of the entity
      """
      entityId: ID!
      """
      The updated properties of the entity.
      """
      updatedProperties: JSONObject!
    ): UnknownPersistedEntity!
  }
`;
