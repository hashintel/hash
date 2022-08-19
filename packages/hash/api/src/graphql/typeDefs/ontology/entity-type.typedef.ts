import { gql } from "apollo-server-express";

export const entityTypeTypedef = gql`
  scalar EntityType

  type PersistedEntityType {
    entityTypeVersionedUri: String!
    createdBy: ID!
    schema: EntityType!
    # TODO: we might need something like
    # "referencedPropertyTypes: [PersistedPropertyType!]"
  }

  extend type Query {
    """
    Get all entity types at their latest version.
    """
    getAllLatestEntityTypes: [PersistedEntityType!]!

    """
    Get a entity type by its versioned URI.
    """
    getEntityType(entityTypeVersionedUri: String!): PersistedEntityType!
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
      entityType: EntityType!
    ): PersistedEntityType!

    """
    Update a entity type.
    """
    updateEntityType(
      """
      accountId refers to the account to update the entity type in.
      """
      accountId: ID!
      """
      The entity type versioned $id to update.
      """
      entityTypeVersionedUri: String!
      """
      New entity type schema contents to be used.
      """
      updatedEntityType: EntityType!
    ): PersistedEntityType!
  }
`;
