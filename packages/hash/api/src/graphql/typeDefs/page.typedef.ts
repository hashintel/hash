import { gql } from "apollo-server-express";

export const pageTypedef = gql`
  type Page implements Entity {
    contents: [Block!]!

    properties: PageProperties!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity - alias of 'entityId'
    """
    id: ID!
    """
    The id of the entity - alias of 'id'
    """
    entityId: ID!
    """
    The specific version if of the entity
    """
    entityVersionId: ID!
    """
    The id of the account this entity belongs to
    """
    accountId: ID!
    """
    The date the entity was created
    """
    createdAt: Date!
    """
    The date this entity version was created.
    """
    entityVersionCreatedAt: Date!
    """
    The user who created the entity
    """
    createdByAccountId: ID!
    """
    The date the entity was last updated
    """
    updatedAt: Date!
    """
    The visibility level of the entity
    """
    visibility: Visibility!
    """
    The fixed id of the type this entity is of
    """
    entityTypeId: ID!
    """
    The id of the specific version of the type this entity is of
    """
    entityTypeVersionId: ID!
    """
    The name of the entity type this belongs to.
    N.B. Type names are unique by account - not globally.
    """
    entityTypeName: String!
    """
    The full entityType definition
    """
    entityType: EntityType!
    """
    The version timeline of the entity.
    """
    history: [EntityVersion!]
    """
    The metadata ID of the entity. This is shared across all versions of the same entity.
    """
    metadataId: ID!
    """
    The outgoing links of the entity.
    """
    linkGroups: [LinkGroup!]!
    """
    The linked entities of the entity.
    """
    linkedEntities: [UnknownEntity!]!
    """
    The linked aggregations of the entity.
    """
    linkedAggregations: [LinkedAggregation!]!
    # ENTITY INTERFACE FIELDS END #

    """
    The entity id of the page's parent (equivalent to "parentPage.entityId").

    Can be used for nesting pages in a tree structure.
    """
    parentPageEntityId: ID
    """
    The parent page of the page
    """
    parentPage: Page
  }

  type PageProperties {
    archived: Boolean
    contents: [Block!]!
      @deprecated(
        reason: """
        The page "contents" are no longer stored in the properties of a page. Use the page's "contents" or "linkGroups" field resolvers instead.
        """
      )
    summary: String
    title: String!
  }

  type EntityRef {
    accountId: ID!
    entityId: ID!
    entityVersionId: ID!
  }

  type PageSearchResult {
    """
    The accuracy of the search result. A number in the range [0, 1]
    """
    score: Float!
    """
    A reference to the page where the search result was found.
    """
    page: EntityRef!
    """
    A reference to the block in the page where the search result was found. This is
    null if the search match corresponds to a page title.
    """
    block: EntityRef
    """
    A reference to the text entity in the block where the search result was found. This
    is null if the search match corresponds to a page title.
    """
    text: EntityRef
    """
    The content of the search match.
    """
    content: String!
  }

  extend type Query {
    """
    Return a page by its id
    """
    page(accountId: ID!, entityVersionId: ID, entityId: ID): Page!

    """
    Return a list of pages belonging to an account
    """
    accountPages(accountId: ID!): [Page!]!

    """
    Search for pages matching a query string.
    Returns a BAD_USER_INPUT error if the query string is empty.
    """
    searchPages(accountId: ID!, query: String!): [PageSearchResult!]!
  }

  input PageCreationData {
    title: String!
  }

  input PageUpdateData {
    # need to figure out contents input shape
    # each item in contents could potentially one of:
    # - data to create a new block
    # - references by id to existing blocks
    # - references by id to existing block with an update
    # just make it JSON for now for testing purposes
    contents: [JSONObject!]
    title: String
    summary: String
  }

  """
  Insert a block into a page with a corresponding entity.
  """
  input InsertBlock {
    """
    The account ID to create the block and associated entity in.
    """
    accountId: ID!
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
    existingBlockEntity: ExistingEntity
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
  input RemoveBlock {
    """
    The position of the block to remove from the page.
    """
    position: Int!
  }

  """
  Move a block within a page.
  """
  input MoveBlock {
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
  input UpdateEntity {
    """
    The account the entity resides in.
    """
    accountId: ID!
    """
    The entity's fixed ID.
    """
    entityId: ID!
    """
    The entity's new properties.
    """
    properties: JSONObject!
  }

  """
  Swap a blocks data
  """
  input SwapBlockData {
    """
    The account the block resides in
    """
    accountId: ID!

    """
    The Block entity's fixed ID
    """
    entityId: ID!

    """
    The account the new entity resides in
    """
    newEntityAccountId: ID!

    """
    The new entity's fixed ID
    """
    newEntityEntityId: ID!
  }

  """
  Create an entity, which you can then reference in other actions, such as a InsertBlockAction
  """
  input CreateEntityAction {
    entity: EntityDefinition!
    entityPlaceholderId: ID
    accountId: ID!
  }

  """
  Create an entity type, which you can then reference in future CreateEntityActions
  """
  input CreateEntityTypeAction {
    accountId: ID!
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
    insertBlock: InsertBlock
    removeBlock: RemoveBlock
    moveBlock: MoveBlock
    updateEntity: UpdateEntity
    swapBlockData: SwapBlockData
    createEntity: CreateEntityAction
    createEntityType: CreateEntityTypeAction
  }

  """
  Map of placeholder IDs used in the UpdatePageContentsActions to the entity IDs created for those placeholders
  """
  type UpdatePageContentsResultPlaceholder {
    placeholderId: ID!
    entityId: ID!
  }

  type UpdatePageContentsResult {
    page: Page!
    placeholders: [UpdatePageContentsResultPlaceholder!]!
  }

  extend type Mutation {
    createPage(accountId: ID!, properties: PageCreationData!): Page!

    updatePage(
      accountId: ID!
      entityId: ID!
      properties: PageUpdateData!
    ): Page!

    """
    Set the parent of a page

    If the parentPageEntityId is not set, any existing page link is removed.
    """
    setParentPage(
      accountId: ID!
      pageEntityId: ID!
      parentPageEntityId: ID
    ): Page!

    """
    Atomically update the contents of a page.
    """
    updatePageContents(
      """
      The page's account ID.
      """
      accountId: ID!
      """
      The pages's fixed entity ID.
      """
      entityId: ID!
      """
      The list of actions to perform on the page.
      """
      actions: [UpdatePageAction!]!
    ): UpdatePageContentsResult!
  }
`;
