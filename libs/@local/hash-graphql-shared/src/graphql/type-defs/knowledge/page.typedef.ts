import { gql } from "apollo-server-express";

export const pageTypedef = gql`
  type Page {
    """
    The title of the page.
    """
    title: String!
    """
    The icon given to the page.
    """
    icon: String
    """
    A summary of the page.
    """
    summary: String
    """
    Whether or not this page has been archived.
    """
    archived: Boolean
    """
    The contents of the page.
    """
    contents: [BlockCollectionContentItem!]!
    """
    The fractional index of the page in the page tree.
    """
    fractionalIndex: String
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: EntityPropertiesObject!
    """
    The permissions the requesting user has on the page
    """
    userPermissions: UserPermissions!
  }

  extend type Query {
    pageComments(
      """
      The id of the page entity.
      """
      entityId: EntityId!
    ): [Comment!]!
  }

  input PageCreationData {
    """
    The page title.
    """
    title: String!
    """
    The fractional index of the page that is before the current.
    """
    prevFractionalIndex: String
  }

  input PageUpdateData {
    title: String
    summary: String
    archived: Boolean
    fractionalIndex: String
    icon: String
  }

  extend type Mutation {
    """
    Create a new page
    """
    createPage(
      """
      The new page's account ID.
      """
      ownedById: OwnedById!
      """
      Initial properties to set for the new page.
      """
      properties: PageCreationData!
    ): Page!
    """
    Update an existing page.
    """
    updatePage(entityId: EntityId!, updatedProperties: PageUpdateData!): Page!
    """
    Set the parent of a page

    If the parentPageEntityId is not set, any existing page link is removed.
    """
    setParentPage(
      pageEntityId: EntityId!
      parentPageEntityId: EntityId
      prevFractionalIndex: String
      nextIndex: String
    ): Page!
  }
`;
