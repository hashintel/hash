import { gql } from "apollo-server-express";

export const knowledgeLinkTypedef = gql`
  type KnowledgeLink {
    """
    The id of the account that owns this link.
    """
    ownedById: ID!
    """
    The fixed id of the link type this link is of.
    """
    linkTypeId: String!
    """
    The index of the link (if any).
    """
    index: Int
    """
    The link's source entity.
    """
    sourceEntity: KnowledgeEntity!
    """
    The link's destination entity.
    """
    targetEntity: KnowledgeEntity!
  }
`;
