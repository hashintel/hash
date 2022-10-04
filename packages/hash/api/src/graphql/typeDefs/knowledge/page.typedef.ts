import { gql } from "apollo-server-express";

export const persistedPageTypedef = gql`
  type PersistedPage implements PersistedEntity {
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
    contents: [PersistedBlock!]!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    entityId: ID!
    """
    The specific version of the entity
    """
    entityVersion: String!
    """
    The id of the account that owns this entity.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this entity.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    """
    The versioned URI of this entity's type.
    """
    entityTypeId: String!
    """
    The full entity type definition.
    """
    entityType: PersistedEntityType!
    """
    The linked entities of the entity.
    """
    linkedEntities: [PersistedEntity!]!
    """
    The JSON object containing the entity's properties.
    """
    properties: JSONObject!
    # ENTITY INTERFACE FIELDS END #
  }

  type PersistedEntityRef {
    """
    The id of the account that owns this entity.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this entity.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    entityId: ID!
    entityVersion: String!
  }

  extend type Query {
    """
    Get a page by its entity id.
    """
    persistedPage(
      """
      The id of the page entity.
      """
      entityId: ID!
      """
      The version of the page entity. Defaults to the latest version.
      """
      entityVersion: String
    ): PersistedPage!
  }

  """
  Insert a block into a page with a corresponding entity.
  """
  input InsertPersistedBlockAction {
    """
    The account ID to create the block and associated entity in.
    """
    ownedById: ID!
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
    existingBlockEntity: KnowledgeExistingEntity
    """
    The entity to associate with the new block
    """
    entity: PersistedEntityDefinition!
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
  input RemovePersistedBlockAction {
    """
    The position of the block to remove from the page.
    """
    position: Int!
  }

  """
  Move a block within a page.
  """
  input MovePersistedBlockAction {
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
  input UpdatePersistedEntityAction {
    """
    The account the entity resides in.
    """
    ownedById: ID!
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
  input SwapPersistedBlockDataAction {
    """
    The account the block resides in
    """
    ownedById: ID!

    """
    The Block entity's fixed ID
    """
    entityId: ID!

    """
    The account the new entity resides in
    """
    newEntityOwnedById: ID!

    """
    The new entity's fixed ID
    """
    newEntityEntityId: ID!
  }

  """
  Create an entity, which you can then reference in other actions, such as a InsertBlockAction
  """
  input CreatePersistedEntityAction {
    entity: PersistedEntityDefinition!
    entityPlaceholderId: ID
    ownedById: ID!
  }

  """
  Create an entity type, which you can then reference in future CreateEntityActions
  """
  input CreatePersistedEntityTypeAction {
    ownedById: ID!
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
  input UpdatePersistedPageAction {
    insertBlock: InsertPersistedBlockAction
    removeBlock: RemovePersistedBlockAction
    moveBlock: MovePersistedBlockAction
    updateEntity: UpdatePersistedEntityAction
    swapBlockData: SwapPersistedBlockDataAction
    createEntity: CreatePersistedEntityAction
    createEntityType: CreatePersistedEntityTypeAction
  }

  """
  Map of placeholder IDs used in the UpdatePageContentsActions to the entity IDs created for those placeholders
  """
  type UpdatePersistedPageContentsResultPlaceholder {
    placeholderId: ID!
    entityId: ID!
  }

  type UpdatePersistedPageContentsResult {
    page: PersistedPage!
    placeholders: [UpdatePersistedPageContentsResultPlaceholder!]!
  }

  extend type Mutation {
    """
    Update the contents of a page.
    """
    updatePersistedPageContents(
      """
      The page's account ID.
      """
      ownedById: ID!
      """
      The pages's fixed entity ID.
      """
      entityId: ID!
      """
      The list of actions to perform on the page.
      """
      actions: [UpdatePersistedPageAction!]!
    ): UpdatePersistedPageContentsResult!
  }
`;
