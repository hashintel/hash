import { gql } from "apollo-server-express";

export const knowledgePageTypedef = gql`
  type KnowledgePage implements KnowledgeEntity {
    contents: [KnowledgeBlock!]!
    archived: Boolean
    summary: String
    title: String!
    icon: String

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    entityId: ID!
    """
    The specific version of the entity
    """
    entityVersionId: String!
    """
    The id of the account that owns this entity.
    """
    ownedById: ID!
    """
    The fixed id of the type this entity is of.
    """
    entityTypeId: ID!
    """
    The full entity type definition.
    """
    entityType: PersistedEntityType!
    """
    The linked entities of the entity.
    """
    linkedEntities: [KnowledgeEntity!]!
    """
    The JSON object containing the entity's properties.
    """
    properties: JSONObject!
    # ENTITY INTERFACE FIELDS END #
  }

  type KnowledgeEntityRef {
    accountId: ID!
    entityId: ID!
    entityVersion: String!
  }

  """
  Insert a block into a page with a corresponding entity.
  """
  input KnowledgeInsertBlockAction {
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
    entity: KnowledgeEntityDefinition!
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
  input KnowledgeRemoveBlockAction {
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
  input KnowledgeUpdateEntityAction {
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
  input KnowledgeSwapBlockDataAction {
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
  input KnowledgeCreateEntityAction {
    entity: KnowledgeEntityDefinition!
    entityPlaceholderId: ID
    accountId: ID!
  }

  """
  Create an entity type, which you can then reference in future CreateEntityActions
  """
  input KnowledgeCreateEntityTypeAction {
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
  input KnowledgeUpdatePageAction {
    insertBlock: KnowledgeInsertBlockAction
    removeBlock: KnowledgeRemoveBlockAction
    moveBlock: MoveBlockAction
    updateEntity: KnowledgeUpdateEntityAction
    swapBlockData: KnowledgeSwapBlockDataAction
    createEntity: KnowledgeCreateEntityAction
    createEntityType: KnowledgeCreateEntityTypeAction
  }

  """
  Map of placeholder IDs used in the UpdatePageContentsActions to the entity IDs created for those placeholders
  """
  type KnowledgeUpdatePageContentsResultPlaceholder {
    placeholderId: ID!
    entityId: ID!
  }

  type KnowledgeUpdatePageContentsResult {
    page: Page!
    placeholders: [KnowledgeUpdatePageContentsResultPlaceholder!]!
  }

  extend type Mutation {
    """
    Atomically update the contents of a page.
    """
    knowledgeUpdatePageContents(
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
      actions: [KnowledgeUpdatePageAction!]!
    ): KnowledgeUpdatePageContentsResult!
  }
`;
