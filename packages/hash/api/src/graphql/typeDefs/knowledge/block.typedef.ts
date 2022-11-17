import { gql } from "apollo-server-express";

export const persistedBlockTypedef = gql`
  type PersistedBlock implements EntityWithMetadata {
    """
    The block's linked child entity.
    """
    blockChildEntity: EntityWithMetadata!
    """
    The component id of the block.
    """
    componentId: String!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: PropertyObject!
    # ENTITY INTERFACE FIELDS END #
  }

  extend type Query {
    """
    Get a specified list of blocks by their entity id
    """
    persistedBlocks(blocks: [EntityId!]!): [PersistedBlock!]!
  }
`;
