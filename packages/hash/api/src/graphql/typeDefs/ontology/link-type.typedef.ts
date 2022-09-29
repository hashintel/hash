import { gql } from "apollo-server-express";

export const linkTypeTypedef = gql`
  scalar LinkType
  scalar LinkTypeWithoutId

  type PersistedLinkType {
    """
    The specific versioned URI of the link type
    """
    linkTypeVersionedUri: String!
    """
    The id of the account that owns this link type.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this link type.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
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
      The id of the owner of the link type. Defaults to the user calling the mutation.
      """
      ownedById: ID
      linkType: LinkTypeWithoutId!
    ): PersistedLinkType!

    """
    Update an link type.
    """
    updateLinkType(
      """
      The link type versioned $id to update.
      """
      linkTypeVersionedUri: String!
      """
      New link type schema contents to be used.
      """
      updatedLinkType: LinkTypeWithoutId!
    ): PersistedLinkType!
  }
`;
