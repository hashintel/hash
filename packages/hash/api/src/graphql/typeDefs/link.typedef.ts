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
    """
    The entityVersionId of a specific version of the link's destination entity - defined
    if this link is pinned to a specific version of the destination entity. If omitted,
    the link is to the latest version of the destination entity.
    """
    destinationEntityVersionId: ID
  }

  input CreateLinkInput {
    path: String!
    index: Int
    sourceAccountId: ID!
    sourceEntityId: ID!
    destinationAccountId: ID!
    destinationEntityId: ID!
    destinationEntityVersionId: ID
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
