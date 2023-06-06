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
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: EntityPropertiesObject!
  }

  extend type Query {
    """
    Get a specified list of blocks by their entity id
    """
    blocks(blocks: [EntityId!]!): [Block!]!
  }
`;
