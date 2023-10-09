import { gql } from "apollo-server-express";

export const pageTypedef = gql`
  """
  A special return type to include blocks linked from pages and the link entity (as it might contain positioning data)
  @todo – migrate from pages having special return types to returning subgraphs like other entities
  """
  type PageContentItem {
    rightEntity: Block!
    linkEntity: Entity!
  }

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
    contents: [PageContentItem!]!
    """
    The fractional index of the page in the page tree.
    """
    index: String
    """
    The page's parent page (may not be set).
    """
    parentPage: Page
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: EntityPropertiesObject!
  }

  extend type Query {
    """
    Get a page by its entity id.
    """
    page(
      """
      The id of the page entity.
      """
      entityId: EntityId!
    ): Page!

    """
    Return a list of pages.
    """
    pages(
      """
      The account owning the pages. Defaults to the logged in user.
      """
      ownedById: OwnedById
      """
      Whether or not to include archived pages. Defaults to false.
      """
      includeArchived: Boolean = false
    ): [Page!]!

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
    prevIndex: String
  }

  input PageUpdateData {
    title: String
    summary: String
    archived: Boolean
    index: String
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
      prevIndex: String
      nextIndex: String
    ): Page!
  }
`;
