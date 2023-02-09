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
    contents: [Block!]!
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
    ): [Page!]!

    pageComments(
      """
      The id of the page entity.
      """
      entityId: EntityId!
    ): [Comment!]!
  }

  """
  Insert a block into a page with a corresponding entity.
  """
  input InsertBlockAction {
    """
    The account ID to create the block and associated entity in.
    """
    ownedById: OwnedById!
    """
    The position in the page to place the block.
    """
    position: Int!
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
    properties: JSONObject!
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
  Create an entity type, which you can then reference in future CreateEntityActions
  """
  input CreateEntityTypeAction {
    ownedById: OwnedById!
    """
    The name for the type. Must be unique in the given account.
    """
    name: String!
    """
    A description for the type.
    """
    description: String
    """
    The schema definition for the entity type, in JSON Schema.
    """
    schema: JSONObject
    """
    Allows UpdatePageContentsActions to reference entities created in other actions. Also allows callers to UpdatePageContents to find the entity id created for this definition in the result. See UpdatePageContentsResult.
    """
    placeholderId: ID!
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
    createEntityType: CreateEntityTypeAction
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
