import { gql } from "apollo-server-express";

export const persistedBlockTypedef = gql`
  type PersistedBlock implements PersistedEntity {
    """
    The block's linked child entity.
    """
    blockChildEntity: PersistedEntity!
    """
    The component id of the block.
    """
    componentId: String!

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
    entityType: EntityTypeWithMetadata!
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

  input LatestPersistedEntityRef {
    entityId: ID!
  }

  extend type Query {
    """
    Get a specified list of blocks by their entity id
    """
    persistedBlocks(blocks: [LatestPersistedEntityRef!]!): [PersistedBlock!]!
  }
`;
