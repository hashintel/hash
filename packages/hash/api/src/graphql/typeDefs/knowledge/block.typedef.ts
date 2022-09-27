import { gql } from "apollo-server-express";

export const knowledgeBlockTypedef = gql`
  type KnowledgeBlock implements KnowledgeEntity {
    dataEntity: KnowledgeEntity!

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
