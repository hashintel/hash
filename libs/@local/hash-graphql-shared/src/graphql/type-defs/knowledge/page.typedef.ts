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
      includeArchived: Boolean
    ): [Page!]!

    pageComments(
      """
      The id of the page entity.
      """
      entityId: EntityId!
    ): [Comment!]!
  }

  scalar CanvasPosition

  """
  Insert a block into a page with a corresponding entity.
  """
  input InsertBlockAction {
    """
    The account ID to create the block and associated entity in.
    """
    ownedById: OwnedById!
    """
    The index of the block among other blocks in the page (to be stored on the link between the two)
    """
    position: Int!
    """
    Additional positioning data for blocks in a canvas view (to be stored on the link between the two)
    """
    canvasPosition: CanvasPosition
    """
    The block componentId.
    """
    componentId: ID
    """
    The block entity to insert into the page. You should not set a componentId
    if you provide this
    """
    existingBlockEntityId: EntityId
    """
    The entity to associate with the new block
    """
    entity: EntityDefinition!
    """
    Allows UpdatePageContentsActions to reference entities created in other actions. Also allows callers to updatePageContents to find the entity id created for this definition in the result. See UpdatePageContentsResult.
    """
    blockPlaceholderId: ID
    """
    Allows UpdatePageContentsActions to reference entities created in other actions. Also allows callers to updatePageContents to find the entity id created for this definition in the result. See UpdatePageContentsResult.
    """
    entityPlaceholderId: ID
  }

  """
  Remove a block from a page.
  """
  input RemoveBlockAction {
    """
    The position of the block to remove from the page.
    """
    position: Int!
  }

  """
  Move a block within a page.
  """
  input MoveBlockAction {
    """
    The current position of the block.
    """
    currentPosition: Int!
    """
    The position to move the block to.
    """
    newPosition: Int!
    """
    Additional positioning data for blocks in a canvas view (to be stored on the link between the two)
    """
    canvasPosition: CanvasPosition
  }

  """
  Update an entity in a page.
  """
  input UpdateEntityAction {
    """
    The entity's fixed ID.
    """
    entityId: EntityId!
    """
    The entity's new properties.
    """
    properties: EntityPropertiesObject!
  }

  """
  Swap a blocks data
  """
  input SwapBlockDataAction {
    """
    The Block entity's fixed ID
    """
    entityId: EntityId!
    """
    The new entity's fixed ID
    """
    newEntityEntityId: EntityId!
  }

  """
  Create an entity, which you can then reference in other actions, such as a InsertBlockAction
  """
  input CreateEntityAction {
    entity: EntityDefinition!
    entityPlaceholderId: ID
    ownedById: OwnedById!
  }

  """
  An action to perform when updating the contents of a page. Exactly one field must be
  specified.

  Note: a union type would be preferrable here, but currently, GraphQL does not
  permit unions as input to a mutation
  """
  input UpdatePageAction {
    insertBlock: InsertBlockAction
    removeBlock: RemoveBlockAction
    moveBlock: MoveBlockAction
    updateEntity: UpdateEntityAction
    swapBlockData: SwapBlockDataAction
    createEntity: CreateEntityAction
  }

  """
  Map of placeholder IDs used in the UpdatePageContentsActions to the entity IDs created for those placeholders
  """
  type UpdatePageContentsResultPlaceholder {
    placeholderId: ID!
    entityId: EntityId!
  }

  type UpdatePageContentsResult {
    page: Page!
    placeholders: [UpdatePageContentsResultPlaceholder!]!
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

    """
    Update the contents of a page.
    """
    updatePageContents(
      """
      The pages's fixed entity ID.
      """
      entityId: EntityId!
      """
      The list of actions to perform on the page.
      """
      actions: [UpdatePageAction!]!
    ): UpdatePageContentsResult!
  }
`;
