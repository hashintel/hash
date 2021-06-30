import { gql } from "apollo-server-express";

export const blockTypedef = gql`
  type Block implements Entity {
    properties: BlockProperties!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    id: ID!
    """
    The FIXED id for a namespace
    """
    namespaceId: ID!
    """
    The CHANGEABLE name/slug of the namespace (e.g. username).
    """
    namespace: String!
    """
    The date the entity was created
    """
    createdAt: Date!
    """
    The user who created the entity
    """
    createdById: ID!
    """
    The date the entity was last updated
    """
    updatedAt: Date!
    """
    The visibility level of the entity
    """
    visibility: Visibility!
    """
    The type of entity
    """
    type: String!
    # ENTITY INTERFACE FIELDS END #
  }

  type BlockProperties {
    entityId: ID!
    entity: Entity!
    entityType: String!
    componentId: ID!
  }
`;
