import { gql } from "apollo-server-express";

export const entityTypeTypedef = gql`
  scalar EntityType
  scalar EntityTypeWithoutId

  type PersistedEntityType {
    """
    The specific versioned URI of the entity type
    """
    entityTypeId: String!
    """
    The id of the account that owns this entity type.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this entity type.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    """
    The entity type
    """
    entityType: EntityType!
  }

  extend type Query {
    """
    Get all entity types at their latest version.
    """
    getAllLatestEntityTypes(
      dataTypeResolveDepth: Int!
      propertyTypeResolveDepth: Int!
      linkTypeResolveDepth: Int!
      entityTypeResolveDepth: Int!
    ): Subgraph!

    """
    Get a entity type by its versioned URI.
    """
    getEntityType(
      entityTypeId: String!
      dataTypeResolveDepth: Int!
      propertyTypeResolveDepth: Int!
      linkTypeResolveDepth: Int!
      entityTypeResolveDepth: Int!
    ): Subgraph!
  }

  extend type Mutation {
    """
    Create a entity type.
    """
    createEntityType(
      """
      The id of the account who owns the entity type. Defaults to the user calling the mutation.
      """
      ownedById: ID
      entityType: EntityTypeWithoutId!
    ): PersistedEntityType!

    """
    Update a entity type.
    """
    updateEntityType(
      """
      The entity type versioned $id to update.
      """
      entityTypeId: String!
      """
      New entity type schema contents to be used.
      """
      updatedEntityType: EntityTypeWithoutId!
    ): PersistedEntityType!
  }
`;
