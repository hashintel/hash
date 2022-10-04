import { gql } from "apollo-server-express";

export const knowledgeLinkTypedef = gql`
  type KnowledgeLink {
    """
    The id of the account that owns this link.
    """
    ownedById: ID!
    """
    The versioned URI of this link's type.
    """
    linkTypeId: String!
    """
    The index of the link (if any).
    """
    index: Int
    """
    The id of the link's source entity.
    """
    sourceEntityId: ID!
    """
    The id of the link's target entity.
    """
    targetEntityId: ID!
    """
    The link's source entity.
    """
    sourceEntity: PersistedEntity!
    """
    The link's target entity.
    """
    targetEntity: PersistedEntity!
  }

  input CreateKnowledgeLinkInput {
    """
    The versioned URI of this link's type.
    """
    linkTypeId: String!
    """
    The index of the link (if any).
    """
    index: Int
    """
    The id of the account that should own this link.
    """
    ownedById: ID!
    """
    The id of the link's source entity.
    """
    sourceEntityId: ID!
    """
    The id of the link's target entity.
    """
    targetEntityId: ID!
  }

  input LinkIdentifier {
    """
    The versioned URI of this link's type.
    """
    linkTypeId: String!
    """
    The id of the link's source entity.
    """
    sourceEntityId: ID!
    """
    The id of the link's target entity.
    """
    targetEntityId: ID!
  }

  extend type Query {
    """
    Get the outgoing links of an entity.
    """
    outgoingKnowledgeLinks(
      """
      The id of the source entity.
      """
      sourceEntityId: ID!
      """
      The id of the link's type.
      """
      linkTypeId: String
    ): [KnowledgeLink!]!
  }

  extend type Mutation {
    """
    Create a link.
    """
    createKnowledgeLink(link: CreateKnowledgeLinkInput!): KnowledgeLink!
    """
    Delete a link.
    """
    deleteKnowledgeLink(link: LinkIdentifier!): Boolean!
  }
`;
