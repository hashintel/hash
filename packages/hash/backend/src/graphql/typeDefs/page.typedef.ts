import { gql } from "apollo-server-express";

export const pageTypedef = gql`
  type Page implements Entity {
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
    createdById: ID!
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
    # ENTITY INTERFACE FIELDS END #
  }

  type PageProperties {
    archived: Boolean
    contents: [Block!]!
    summary: String
    title: String!
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
  Data to create a block with a new entity in it.
  As well as entityProperties, entity type info must be provided.
  Type info must be ONE OF:
  - entityTypeId (the latest version of this type will be assigned)
  - entityTypeVersionId (this specific version of the type will be assigned)
  - systemTypeName (this version will be assigned)
  """
  input InsertBlocksData {
    componentId: ID!
    entityProperties: JSONObject!
    entityTypeId: ID
    entityTypeVersionId: ID
    systemTypeName: SystemTypeName
    accountId: ID!
  }

  extend type Mutation {
    createPage(accountId: ID!, properties: PageCreationData!): Page!

    updatePage(
      accountId: ID!
      entityId: ID!
      properties: PageUpdateData!
    ): Page!

    """
    Insert a block into a given page.
    EITHER:
    - entityId (for rendering an existing entity)
    OR
    - entityProperties and type info for creating a new entity.
      Type info must be ONE OF:
        - entityTypeId (the latest version of this type will be assigned)
        - entityTypeVersionId (this specific version of the type will be assigned)
        - systemTypeName (this version will be assigned)
    must be provided.
    """
    insertBlockIntoPage(
      componentId: ID!
      entityId: ID
      entityProperties: JSONObject
      entityTypeId: ID
      entityTypeVersionId: ID
      systemTypeName: SystemTypeName
      """
      The accountId for the block and entity.
      Defaults to the page's accountId.
      """
      accountId: ID!
      pageEntityVersionId: ID!
      pageEntityId: ID!
      versioned: Boolean! = false
      """
      The position of the block in the page contents, starting at 0
      """
      position: Int!
    ): Page!

    insertBlocksIntoPage(
      accountId: ID!
      """
      The fixed entity ID of the page.
      """
      entityId: ID!
      """
      The entity version ID of the page.
      """
      entityVersionId: ID!
      """
      The blocks to insert.
      """
      blocks: [InsertBlocksData!]!

      """
      The ID of the block in the page after which the new blocks should be inserted.
      If null, the blocks will be inserted at the start of the page.
      """
      previousBlockId: ID
    ): Page!
  }
`;
