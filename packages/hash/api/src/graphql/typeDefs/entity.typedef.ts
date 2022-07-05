import { gql } from "apollo-server-express";

export const entityTypedef = gql`
  interface Entity {
    # These fields are repeated everywhere they're used because
    # (a) GQL requires it - https://github.com/graphql/graphql-spec/issues/533
    # (b) string interpolation breaks the code generator's introspection
    #
    # Could maybe use a custom schema loader to parse it ourselves:
    # https://www.graphql-code-generator.com/docs/getting-started/schema-field#custom-schema-loader
    #
    # For now, _COPY ANY CHANGES_ from here to any type that 'implements Entity'
    """
    The id of the entity - alias of 'entityId'
    """
    id: ID!
    """
    The id of the entity - alias of 'id'
    """
    entityId: ID!
    """
    The specific version if of the entity
    """
    entityVersionId: ID!
    """
    The id of the account this entity belongs to
    """
    accountId: ID!
    """
    The date the entity was created
    """
    createdAt: Date!
    """
    The date this entity version was created.
    """
    entityVersionCreatedAt: Date!
    """
    The user who created the entity
    """
    createdByAccountId: ID!
    """
    The date the entity was last updated
    """
    updatedAt: Date!
    """
    The visibility level of the entity
    """
    visibility: Visibility!
    """
    The fixed id of the type this entity is of
    """
    entityTypeId: ID!
    """
    The id of the specific version of the type this entity is of
    """
    entityTypeVersionId: ID!
    """
    The name of the entity type this belongs to.
    N.B. Type names are unique by account - not globally.
    """
    entityTypeName: String!
    """
    The full entityType definition.
    """
    entityType: EntityType
    """
    The version timeline of the entity.
    """
    history: [EntityVersion!]
    """
    The outgoing links of the entity.
    """
    linkGroups: [LinkGroup!]!
    """
    The linked entities of the entity.
    """
    linkedEntities: [UnknownEntity!]!
    """
    The linked aggregations of the entity.
    """
    linkedAggregations: [LinkedAggregation!]!
  }

  """
  A grouping of links with the same:
    - source entity entityId
    - source entity entityVersionId
    - path
  """
  type LinkGroup {
    """
    The accountId of the source entity for the link group.
    """
    sourceAccountId: ID!
    """
    The entityId of the source entity for the link group.
    """
    sourceEntityId: ID!
    """
    The entityVersionId of the source entity for the link group.
    """
    sourceEntityVersionId: ID!
    """
    The path of the link group.
    """
    path: String!
    """
    The complete collection of links in the link group.
    """
    links: [Link!]!
  }

  scalar UnknownEntityProperties

  type UnknownEntity implements Entity {
    properties: UnknownEntityProperties!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity - alias of 'entityId'
    """
    id: ID!
    """
    The id of the entity - alias of 'id'
    """
    entityId: ID!
    """
    The specific version if of the entity
    """
    entityVersionId: ID!
    """
    The id of the account this entity belongs to
    """
    accountId: ID!
    """
    The date the entity was created
    """
    createdAt: Date!
    """
    The date this entity version was created.
    """
    entityVersionCreatedAt: Date!
    """
    The user who created the entity
    """
    createdByAccountId: ID!
    """
    The date the entity was last updated
    """
    updatedAt: Date!
    """
    The visibility level of the entity
    """
    visibility: Visibility!
    """
    The fixed id of the type this entity is of
    """
    entityTypeId: ID!
    """
    The id of the specific version of the type this entity is of
    """
    entityTypeVersionId: ID!
    """
    The name of the entity type this belongs to.
    N.B. Type names are unique by account - not globally.
    """
    entityTypeName: String!
    """
    The full entityType definition
    """
    entityType: EntityType!
    """
    The version timeline of the entity.
    """
    history: [EntityVersion!]
    """
    The outgoing links of the entity.
    """
    linkGroups: [LinkGroup!]!
    """
    The linked entities of the entity.
    """
    linkedEntities: [UnknownEntity!]!
    """
    The linked aggregations of the entity.
    """
    linkedAggregations: [LinkedAggregation!]!
    # ENTITY INTERFACE FIELDS END #
  }

  enum Visibility {
    PRIVATE
    PUBLIC
  }

  type EntityVersion {
    """
    The entityVersionId of this version
    """
    entityVersionId: ID!
    """
    The time this version was created.
    """
    createdAt: Date!
  }

  """
  Select entity types by ONE of entityType, componentId, entityTypeId, entityTypeVersionId, systemTypeName
  """
  input EntityTypeChoice {
    """
    For entity types related to block types, the URI of the block. 'componentId' in the entity type's schema.
    """
    componentId: ID
    """
    A fixed entity type ID. This may be a reference to a placeholder set using a previous CreateEntityTypeAction
    """
    entityTypeId: ID
    """
    A specific type version ID.
    """
    entityTypeVersionId: ID
    """
    A system type name.
    """
    systemTypeName: SystemTypeName
  }
  """
  Filter entities
  """
  input EntityFilter {
    entityType: EntityTypeChoice
  }

  input LinkedEntityDefinition {
    """
    The JSON path where the link occurs on its source entity's properties.
    """
    path: String!
    destinationAccountId: ID!
    """
    The index of the link (if any)
    """
    index: Int
    entity: EntityDefinition!
  }

  """
  For referring to an existing entity owned by a specific accountId
  """
  input ExistingEntity {
    """
    This may be a reference to a placeholder set using placeholderId on a previous UpdatePageContentsAction
    """
    entityId: ID!
    accountId: ID!
  }

  input EntityDefinition {
    """
    Existing Entity to use instead of creating a new entity.
    """
    existingEntity: ExistingEntity
    """
    Whether the new entity should be versioned. Default is true.
    """
    versioned: Boolean = true
    """
    The type of which to instantiate the new entity.
    """
    entityType: EntityTypeChoice
    """
    The properties of new entity.
    """
    entityProperties: JSONObject
    """
    Associated Entities to either create/get and link to this entity.
    """
    linkedEntities: [LinkedEntityDefinition!]
  }

  extend type Query {
    entity(accountId: ID!, entityVersionId: ID, entityId: ID): UnknownEntity!
    entities(accountId: ID!, filter: EntityFilter): [UnknownEntity!]!
  }

  extend type Mutation {
    """
    Create an entity
    """
    createEntity(accountId: ID!, entity: EntityDefinition!): UnknownEntity!

    """
    Update an entity
    """
    updateEntity(
      accountId: ID!
      entityId: ID!
      properties: JSONObject!
    ): UnknownEntity!

    """
    Transfers an entity from an account to another
    """
    transferEntity(
      """
      id of the original account the entity currently belongs to
      """
      originalAccountId: ID!
      """
      id of the entity to transfer
      """
      entityId: ID!
      """
      id of the new account to transfer the entity to
      """
      newAccountId: ID!
    ): UnknownEntity!
  }
`;
