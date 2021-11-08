import { gql } from "apollo-server-express";

export const linkTypedef = gql`
  type Link {
    """
    The id of the link.
    """
    id: ID!
    """
    The accountId of the link's source entity.
    """
    srcAccountId: ID!
    """
    The entityId of the link's source entity.
    """
    srcEntityId: ID!
    """
    The accountId of the link's source entity.
    """
    dstAccountId: ID!
    """
    The entityId of the link's destination entity.
    """
    dstEntityId: ID!
    """
    The entityVersionId of a specific version of the link's destination entity - defined
    if this link is pinned to a specific version of the destination entity. If omitted,
    the link is to the latest version of the destination entity.
    """
    dstEntityVersionId: ID
    """
    The JSON path where the link occurs on its source entity's properties.
    """
    path: String!
  }

  extend type Mutation {
    """
    Create a link
    """
    createLink(
      path: String!
      srcAccountId: ID!
      srcEntityId: ID!
      dstAccountId: ID!
      dstEntityId: ID!
      dstEntityVersionId: ID
    ): Link!
    """
    Delete a link
    """
    deleteLink(srcAccountId: ID!, srcEntityId: ID!, path: String!): Boolean!
  }
`;
