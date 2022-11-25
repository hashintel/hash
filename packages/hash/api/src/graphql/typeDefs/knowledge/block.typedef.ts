import { gql } from "apollo-server-express";

export const blockTypedef = gql`
  type Block {
    """
    The block's linked child entity.
    """
    blockChildEntity: Entity!
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
    blocks(blocks: [EntityId!]!): [Block!]!
  }
`;
