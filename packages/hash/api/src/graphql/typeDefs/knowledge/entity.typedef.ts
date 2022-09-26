import { gql } from "apollo-server-express";

export const knowledgeEntityTypedef = gql`
  # @todo add 'links' field to KnowledgeEntity
  #   see https://app.asana.com/0/1202805690238892/1203046447168470/f
  interface KnowledgeEntity {
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
    entityType: EntityType!
    """
    The linked entities of the entity.
    """
    linkedEntities: [KnowledgeEntity!]!
    """
    The JSON object containing the entity's properties.
    """
    properties: JSONObject!
  }

  """
  For referring to an existing entity owned by a specific account id
  """
  input KnowledgeExistingEntity {
    """
    This may be a reference to a placeholder set using placeholderId on a previous UpdatePageContentsAction.
    """
    entityId: ID!
    ownedById: ID!
  }

  """
  Select entity types by ONE of componentId, entityTypeId
  """
  input KnowledgeEntityTypeChoice {
    """
    For entity types related to block types, the URI of the block. 'componentId' in the entity type's schema.
    """
    componentId: ID
    """
    A fixed entity type ID. This may be a reference to a placeholder set using a previous createEntityTypeAction.
    """
    entityTypeId: String
  }

  input KnowledgeLinkedEntityDefinition {
    destinationAccountId: ID!
    linkTypeId: String!
    """
    The index of the link (if any)
    """
    index: Int
    entity: KnowledgeEntityDefinition!
  }

  input KnowledgeEntityDefinition {
    """
    Existing Entity to use instead of creating a new entity.
    """
    existingEntity: KnowledgeExistingEntity
    """
    The type of which to instantiate the new entity.
    """
    entityType: KnowledgeEntityTypeChoice
    """
    The properties of new entity.
    """
    entityProperties: JSONObject
    """
    Associated Entities to either create/get and link to this entity.
    """
    linkedEntities: [KnowledgeLinkedEntityDefinition!]
  }
`;
