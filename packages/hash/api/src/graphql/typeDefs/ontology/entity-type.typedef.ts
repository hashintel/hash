import { gql } from "apollo-server-express";

export const entityTypeTypedef = gql`
  # scalar EntityType
  scalar EntityTypeWithoutId
  scalar EntityTypeWithMetadata

  extend type Query {
    """
    Get a subgraph rooted at all entity types at their latest version.
    """
    getAllLatestEntityTypes(
      dataTypeResolveDepth: Int!
      propertyTypeResolveDepth: Int!
      linkTypeResolveDepth: Int!
      entityTypeResolveDepth: Int!
    ): Subgraph!

    """
    Get a subgraph rooted at an entity type resolved by its versioned URI.
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
    ): EntityTypeWithMetadata!

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
    ): EntityTypeWithMetadata!
  }
`;
