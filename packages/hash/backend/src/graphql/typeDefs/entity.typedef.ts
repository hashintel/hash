import { gql } from "apollo-server-express";

export const entityTypedef = gql`
  interface Entity {
    # These fields are repeated everywhere they're used because
    # (a) GQL requires it - https://github.com/graphql/graphql-spec/issues/533
    # (b) string interpolation breaks the code generator's introspection
    #
    # Could maybe use a custom schema loader to parse it ourselves:
    # https://www.graphql-code-generator.com/docs/getting-started/schema-field#custom-schema-loader
    #
    # For now, _COPY ANY CHANGES_ from here to any type that 'implements Entity'
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
  }

  type UnknownEntity implements Entity {
    properties: JSONObject!

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

  enum Visibility {
    PRIVATE
    PUBLIC
  }

  extend type Query {
    entity(namespaceId: ID!, id: ID!): UnknownEntity!

    """
    Aggregate an entity
    """
    aggregateEntity(
      namespaceId: ID!
      type: String!
      operation: AggregateOperationInput
    ): AggregationResponse!
  }

  input AggregateOperationInput {
    filter: FilterOperationInput
    perPage: Int = 10
    page: Int = 1
    sort: String = updatedAt
  }

  input FilterOperationInput {
    field: String!
    value: String!
  }

  type AggregateOperation {
    filter: FilterOperation
    perPage: Int!
    page: Int!
    sort: String!
  }

  type FilterOperation {
    field: String!
    value: String!
  }

  type AggregationResponse {
    operation: AggregateOperation
    results: [Entity!]!
  }

  extend type Mutation {
    """
    Create an entity
    """
    createEntity(
      namespaceId: ID!
      createdById: ID!
      properties: JSONObject!
      type: String!
    ): Entity!

    """
    Update an entity
    """
    updateEntity(namespaceId: ID!, id: ID!, properties: JSONObject!): Entity!
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
`;
