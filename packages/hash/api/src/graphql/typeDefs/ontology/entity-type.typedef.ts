import { gql } from "apollo-server-express";

export const entityTypeTypedef = gql`
  scalar EntityType
  scalar EntityTypeWithoutId

  interface PersistedEntityTypeInterface {
    # These fields are repeated everywhere they're used because
    # (a) GQL requires it - https://github.com/graphql/graphql-spec/issues/533
    # (b) string interpolation breaks the code generator's introspection
    #
    # Could maybe use a custom schema loader to parse it ourselves:
    # https://www.graphql-code-generator.com/docs/getting-started/schema-field#custom-schema-loader
    #
    # For now, _COPY ANY CHANGES_ from here to any type that 'implements PersistedPropertyTypeInterface'

    """
    The specific versioned URI of the entity type
    """
    entityTypeVersionedUri: String!
    """
    The user who created the entity type
    """
    accountId: ID!
    """
    The entity type
    """
    entityType: EntityType!
  }

  type PersistedEntityType implements PersistedEntityTypeInterface {
    # INTERFACE FIELDS BEGIN #
    """
    The specific versioned URI of the entity type
    """
    entityTypeVersionedUri: String!
    """
    The user who created the entity type
    """
    accountId: ID!
    """
    The entity type
    """
    entityType: EntityType!
    # INTERFACE FIELDS END #
  }

  type EntityTypeRootedSubgraph implements PersistedEntityTypeInterface {
    """
    Data types indirectly referenced by this entity type
    """
    referencedDataTypes(depth: Int): [PersistedDataType!]!
    """
    Property types directly or indirectly referenced by this entity type
    """
    referencedPropertyTypes(depth: Int): [PersistedPropertyType!]!
    """
    Link types directly or indirectly referenced by this entity type
    """
    referencedLinkTypes(depth: Int): [PersistedLinkType!]!
    """
    Entity types directly or indirectly referenced by this entity type
    """
    referencedEntityTypes(depth: Int): [PersistedEntityType!]!

    # INTERFACE FIELDS BEGIN #
    """
    The specific versioned URI of the entity type
    """
    entityTypeVersionedUri: String!
    """
    The user who created the entity type
    """
    accountId: ID!
    """
    The entity type
    """
    entityType: EntityType!
    # INTERFACE FIELDS END #
  }

  extend type Query {
    """
    Get all entity types at their latest version.
    """
    getAllLatestEntityTypes: [EntityTypeRootedSubgraph!]!

    """
    Get a entity type by its versioned URI.
    """
    getEntityType(entityTypeVersionedUri: String!): EntityTypeRootedSubgraph!
  }

  extend type Mutation {
    """
    Create a entity type.
    """
    createEntityType(
      """
      accountId refers to the account to create the entity type in.
      """
      accountId: ID
      entityType: EntityTypeWithoutId!
    ): PersistedEntityType!

    """
    Update a entity type.
    """
    updateEntityType(
      """
      accountId refers to the account to update the entity type in.
      """
      accountId: ID
      """
      The entity type versioned $id to update.
      """
      entityTypeVersionedUri: String!
      """
      New entity type schema contents to be used.
      """
      updatedEntityType: EntityTypeWithoutId!
    ): PersistedEntityType!
  }
`;
