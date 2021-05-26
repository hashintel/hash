import { gql } from "apollo-server-express";

export const ROOT_ENTITY_FIELDS = `
  id: ID!
  """The fixed id for a namespace"""
  namespaceId: ID!
  """The namespace slug / account name (may change)"""
  namespace: String!

  createdAt: Date!
  createdBy: User!
  updatedAt: Date!
  visibility: Visibility!

  """The type of entity"""
  type: String!
`;

export const entityTypedef = gql`  
  interface Entity {
    # These fields are not interpolated because the code generator
    # doesn't handle interpolation as the only entry in a definition
    id: ID!
    """The fixed id for a namespace"""
    namespaceId: ID!
    """The namespace slug / account name (may change)"""
    namespace: String!

    createdAt: Date!
    createdBy: User!
    updatedAt: Date!
    visibility: Visibility!

    """The type of entity"""
    type: String!
  }

  type UnknownEntity implements Entity {
    properties: JSONObject!
    
    # Interpolation can't be the first entry for syntax highlighting to work
    ${ROOT_ENTITY_FIELDS}
  }

  enum Visibility {
    PRIVATE
    PUBLIC
  }

  extend type Query {
    entity(id: ID!): Entity!
  }

  extend type Mutation {
    """
    Update an entity
    """
    updateEntity(id: ID!): Entity!
  }

  """
  A schema describing and validating a specific type of entity
  """
  type EntityType implements Entity {
    """
    The name of the entity type
    """
    name: String!
    """
    The shape of the entity, expressed as a JSON Schema
    https://json-schema.org/
    """
    properties: JSONObject!

    ${ROOT_ENTITY_FIELDS}
  }
`;
