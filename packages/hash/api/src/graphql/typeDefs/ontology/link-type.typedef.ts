import { gql } from "apollo-server-express";

export const linkTypeTypedef = gql`
  scalar LinkType

  type IdentifiedLinkType {
    linkTypeVersionedUri: String!
    createdBy: ID!
    schema: LinkType!
  }

  extend type Query {
    """
    Get all link types at their latest version.
    """
    getAllLatestLinkTypes: [IdentifiedLinkType!]!

    """
    Get an link type by its versioned URI.
    """
    getLinkType(linkTypeVersionedUri: String!): IdentifiedLinkType!
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
    ): IdentifiedLinkType!

    """
    Update an link type.
    """
    updateLinkType(
      """
      accountId refers to the account to update the link type in.
      """
      accountId: ID!
      linkType: LinkType!
    ): IdentifiedLinkType!
  }
`;
