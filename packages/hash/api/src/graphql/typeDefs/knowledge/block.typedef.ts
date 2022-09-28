import { gql } from "apollo-server-express";

export const knowledgeBlockTypedef = gql`
  type KnowledgeBlock implements KnowledgeEntity {
    """
    The block's linked data entity.
    """
    dataEntity: KnowledgeEntity!
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
    entityVersionId: String!
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
    The fixed id of the type this entity is of.
    """
    entityTypeId: ID!
    """
    The full entity type definition.
    """
    entityType: PersistedEntityType!
    """
    The linked entities of the entity.
    """
    linkedEntities: [KnowledgeEntity!]!
    """
    The JSON object containing the entity's properties.
    """
    properties: JSONObject!
    # ENTITY INTERFACE FIELDS END #
  }
`;
