import { gql } from "apollo-server-express";

export const blockCollectionTypedef = gql`
  """
  A special return type to include blocks linked from block collections and the link entity (as it might contain positioning data)
  @todo – migrate from block collections having special return types to returning subgraphs like other entities
  """
  type BlockCollectionContentItem {
    rightEntity: Block!
    linkEntity: Entity!
  }

  type BlockCollection {
    """
    The contents of the block collection.
    """
    contents: [BlockCollectionContentItem!]!
    """
    Metadata for the entity.
    """
    metadata: EntityMetadata!
    """
    Properties of entity.
    """
    properties: EntityPropertiesObject!
  }

  scalar HasIndexedContentProperties
  scalar HasSpatiallyPositionedContentProperties

  input PositionInput @oneOf {
    """
    Indexed positioning of the block among other blocks in an indexed block collection
    """
    indexPosition: HasIndexedContentProperties
    """
    Spatial positioning data for blocks in a canvas view
    """
    canvasPosition: HasSpatiallyPositionedContentProperties
  }

  """
  Insert a block into a block collection with a corresponding entity.
  """
  input InsertBlockAction {
    """
    The account ID to create the block and associated entity in.
    """
    ownedById: OwnedById!
    """
    The position of the block in the block collection
    """
    position: PositionInput!
    """
    The block componentId.
    """
    componentId: ID
    """
    The block entity to insert into the block collection. You should not set a componentId
    if you provide this
    """
    existingBlockEntityId: EntityId
    """
    The entity to associate with the new block
    """
    entity: EntityDefinition!
    """
    Allows UpdateBlockCollectionContentsActions to reference entities created in other actions. Also allows callers to updateBlockCollectionContents to find the entity id created for this definition in the result. See UpdateBlockCollectionContentsResult.
    """
    blockPlaceholderId: ID
    """
    Allows UpdateBlockCollectionContentsActions to reference entities created in other actions. Also allows callers to updateBlockCollectionContents to find the entity id created for this definition in the result. See UpdateBlockCollectionContentsResult.
    """
    entityPlaceholderId: ID
  }

  """
  Remove a block from a block collection.
  """
  input RemoveBlockAction {
    """
    The EntityId of the link between the block collection and the block
    """
    linkEntityId: EntityId!
  }

  """
  Move a block within a block collection.
  """
  input MoveBlockAction {
    """
    The EntityId of the link between the block collection and the block
    """
    linkEntityId: EntityId!
    """
    The position of the block in the block collection
    """
    position: PositionInput!
  }

  """
  Update an entity in a block collection.
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
  An action to perform when updating the contents of a block collection. Exactly one field must be
  specified.

  Note: a union type would be preferrable here, but currently, GraphQL does not
  permit unions as input to a mutation
  """
  input UpdateBlockCollectionAction {
    insertBlock: InsertBlockAction
    removeBlock: RemoveBlockAction
    moveBlock: MoveBlockAction
    updateEntity: UpdateEntityAction
    swapBlockData: SwapBlockDataAction
    createEntity: CreateEntityAction
  }

  """
  Map of placeholder IDs used in the UpdateBlockCollectionContentsActions to the entity IDs created for those placeholders
  """
  type UpdateBlockCollectionContentsResultPlaceholder {
    placeholderId: ID!
    entityId: EntityId!
  }

  type UpdateBlockCollectionContentsResult {
    blockCollection: BlockCollection!
    placeholders: [UpdateBlockCollectionContentsResultPlaceholder!]!
  }

  extend type Mutation {
    """
    Update the contents of a block collection.
    """
    updateBlockCollectionContents(
      """
      The block collections's fixed entity ID.
      """
      entityId: EntityId!
      """
      The list of actions to perform on the block collection.
      """
      actions: [UpdateBlockCollectionAction!]!
    ): UpdateBlockCollectionContentsResult!
  }
`;
