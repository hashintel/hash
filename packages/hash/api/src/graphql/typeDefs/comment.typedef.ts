import { gql } from "apollo-server-express";

export const commentTypedef = gql`
  type Comment implements Entity {
    properties: CommentProperties!

    """
    Text contents of the comment
    """
    tokens: [TextToken!]!

    """
    User that created the comment
    """
    author: User!

    """
    Parent block the comment belongs to
    """
    parent: Block!

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
    createdByAccountId: ID!
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
    The outgoing links of the entity.
    """
    linkGroups: [LinkGroup!]!
    """
    The linked entities of the entity.
    """
    linkedEntities: [UnknownEntity!]!
    """
    The linked aggregations of the entity.
    """
    linkedAggregations: [LinkedAggregation!]!
    # ENTITY INTERFACE FIELDS END #
  }

  type CommentProperties {
    """
    Timestamp of when the comment was created
    """
    createdAt: Date
    """
    Timestamp of when the comment was resolved
    """
    resolvedAt: Date
    """
    # Timestamp of when the comment was last edited
    """
    textUpdatedAt: Date
  }

  extend type Mutation {
    createComment(
      """
      Account id of the block the comment belongs to
      """
      accountId: ID!
      """
      Id of the block the comment belongs to
      """
      parentId: ID!
      """
      Text contents of the comment
      """
      tokens: [TextToken!]!
    ): Comment!
  }
`;
