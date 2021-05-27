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
    page(id: ID!): Page!
  }

  extend type Mutation {
    updatePage(id: ID!): Page!
  }
`;
