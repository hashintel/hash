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
    The metadata ID of the entity. This is shared across all versions of the same entity.
    """
    metadataId: ID!
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
    The metadata ID of the entity. This is shared across all versions of the same entity.
    """
    metadataId: ID!
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
  Filter entity types by any of entityType, componentId, entityTypeId, entityTypeVersionId, systemTypeName
  """
  input EntityTypeFilter {
    componentId: ID
    entityTypeId: ID
    entityTypeVersionId: ID
    systemTypeName: SystemTypeName
  }
  """
  Filter entities
  """
  input EntityFilter {
    entityType: EntityTypeFilter
  }

  extend type Query {
    entity(accountId: ID!, entityVersionId: ID, entityId: ID): UnknownEntity!
    entities(accountId: ID!, filter: EntityFilter): [UnknownEntity!]!
  }

  extend type Mutation {
    """
    Create an entity
    """
    createEntity(
      accountId: ID!
      properties: JSONObject!
      """
      The id of an existing entity type to assign this entity
      """
      entityTypeId: ID
      """
      Optionally use a specific version of the entityType.
      If not provided, the latest will be used.
      """
      entityTypeVersionId: ID
      """
      Assign a prefined type to the entity
      """
      systemTypeName: SystemTypeName
      versioned: Boolean! = false
    ): Entity!

    """
    Update an entity
    """
    updateEntity(
      accountId: ID!
      entityId: ID!
      properties: JSONObject!
    ): Entity!

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
    ): Entity!
  }
`;
