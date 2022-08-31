import { gql } from "apollo-server-express";

export const linkTypeTypedef = gql`
  scalar LinkType

  type PersistedLinkType {
    """
    The specific versioned URI of the link type
    """
    linkTypeVersionedUri: String!
    """
    The user who created the link type
    """
    accountId: ID!
    """
    The link type
    """
    linkType: LinkType!
  }

  extend type Query {
    """
    Get all link types at their latest version.
    """
    getAllLatestLinkTypes: [PersistedLinkType!]!

    """
    Get an link type by its versioned URI.
    """
    getLinkType(linkTypeVersionedUri: String!): PersistedLinkType!
  }

  extend type Mutation {
    """
    Create an link type.
    """
    createLinkType(
      """
      The id of the account where to create the link type in. Defaults to the account id of the current user.
      """
      accountId: ID
      linkType: LinkType!
    ): PersistedLinkType!

    """
    Update an link type.
    """
    updateLinkType(
      """
      The id of the account where to create the updated link type in. Defaults to the account id of the current user.
      """
      accountId: ID
      """
      The link type versioned $id to update.
      """
      linkTypeVersionedUri: String!
      """
      New link type schema contents to be used.
      """
      updatedLinkType: LinkType!
    ): PersistedLinkType!
  }
`;
