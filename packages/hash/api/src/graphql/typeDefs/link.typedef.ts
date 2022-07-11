import { gql } from "apollo-server-express";

export const linkTypedef = gql`
  type Link {
    """
    The id of the link.
    """
    linkId: ID!
    """
    The JSON path where the link occurs on its source entity's properties.
    """
    path: String!
    """
    The index of the link (if any)
    """
    index: Int
    """
    The accountId of the link's source entity.
    """
    sourceAccountId: ID!
    """
    The entityId of the link's source entity.
    """
    sourceEntityId: ID!
    """
    The accountId of the link's source entity.
    """
    destinationAccountId: ID!
    """
    The entityId of the link's destination entity.
    """
    destinationEntityId: ID!
  }

  input CreateLinkInput {
    path: String!
    index: Int
    sourceAccountId: ID!
    sourceEntityId: ID!
    destinationAccountId: ID!
    destinationEntityId: ID!
  }

  extend type Query {
    """
    Retrieve a link
    """
    getLink(sourceAccountId: ID!, linkId: ID!): Link!
  }

  extend type Mutation {
    """
    Create a link
    """
    createLink(link: CreateLinkInput!): Link!
    """
    Delete a link using its id
    """
    deleteLink(sourceAccountId: ID!, linkId: ID!): Boolean!
  }
`;
