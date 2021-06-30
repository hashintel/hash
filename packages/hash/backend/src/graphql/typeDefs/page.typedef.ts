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
    The date the entity was created
    """
    createdAt: Date!
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
    page(namespaceId: ID!, id: ID!): Page!

    """
    Return a list of pages belonging to a namespace
    """
    namespacePages(namespaceId: ID!): [Page!]!
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
      namespaceId: ID!
      createdById: ID!
      properties: PageCreationData!
    ): Page!

    updatePage(namespaceId: ID!, id: ID!, properties: PageUpdateData!): Page!
  }
`;
