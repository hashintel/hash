import { gql } from "apollo-server-express";

export const linkTypeTypedef = gql`
  scalar LinkType

  type PersistedLinkType {
    linkTypeVersionedUri: String!
    createdBy: ID!
    schema: LinkType!
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
      accountId refers to the account to create the link type in.
      """
      accountId: ID!
      linkType: LinkType!
    ): PersistedLinkType!

    """
    Update an link type.
    """
    updateLinkType(
      """
      accountId refers to the account to update the link type in.
      """
      accountId: ID!
      """
      The link type versioned $id to update.
      """
      linkTypeVersionedUri: String!
      """
      New link type schema contents to be used.
      """
      newLinkType: LinkType!
    ): PersistedLinkType!
  }
`;
