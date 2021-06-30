import { gql } from "apollo-server-express";

export const pageTypedef = gql`
  type Page implements Entity {
    properties: PageProperties!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    id: ID!
    """
    The FIXED id for a namespace
    """
    namespaceId: ID!
    """
    The CHANGEABLE name/slug of the namespace (e.g. username).
    """
    namespace: String!
    """
    The date the entity was created
    """
    createdAt: Date!
    """
    The user who created the entity
    """
    createdBy: User!
    """
    The date the entity was last updated
    """
    updatedAt: Date!
    """
    The visibility level of the entity
    """
    visibility: Visibility!
    """
    The type of entity
    """
    type: String!
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
    page(id: ID!): Page!

    """
    Return a list of pages belonging to a namespace
    """
    namespacePages(namespaceId: ID, namespace: String): [Page!]!
  }

  input PageCreationData {
    # need to figure out contents input shape
    # each item in contents could potentially one of:
    # - data to create a new block
    # - references by id to existing blocks
    # - references by id to existing block with an update
    # just make it JSON for now for testing purposes
    contents: [JSONObject!]!
    title: String!
    summary: String
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

  extend type Mutation {
    createPage(
      namespaceId: ID
      namespace: String
      properties: PageCreationData!
    ): Page!

    updatePage(id: ID!, properties: PageUpdateData!): Page!

    """
    Insert a block into a given page. 
    EITHER:
    - entityId (for rendering an existing entity) OR
    - entityProperties and entityType (for creating a new entity)
    must be provided.
    """
    insertBlockIntoPage(
      componentId: ID!
      entityId: ID
      entityProperties: JSONObject
      entityType: String
      """
      The namespaceId for the block and entity. 
      Defaults to the page's namespaceId.
      """
      namespaceId: ID
      pageId: ID!
      """
      The position of the block in the page contents, starting at 0
      """
      position: Int!
    ): Page!
  }
`;
