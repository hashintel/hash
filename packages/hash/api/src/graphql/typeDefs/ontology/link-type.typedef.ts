import { gql } from "apollo-server-express";

export const linkTypeTypedef = gql`
  scalar LinkType
  scalar LinkTypeWithoutId

  type PersistedLinkType {
    """
    The specific versioned URI of the link type
    """
    linkTypeId: String!
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
    Get a subgraph rooted at all link types at their latest version.
    """
    getAllLatestLinkTypes: Subgraph!

    """
    Get a subgraph rooted at an link type resolved by its versioned URI.
    """
    getLinkType(linkTypeId: String!): Subgraph!
  }

  extend type Mutation {
    """
    Create an link type.
    """
    createLinkType(
      """
      The id of the account who owns the link type. Defaults to the user calling the mutation.
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
      linkTypeId: String!
      """
      New link type schema contents to be used.
      """
      updatedLinkType: LinkTypeWithoutId!
    ): PersistedLinkType!
  }
`;
