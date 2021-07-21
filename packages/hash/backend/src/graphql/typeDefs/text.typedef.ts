import { gql } from "apollo-server-express";

export const textTypedef = gql`
  type Text implements Entity {
    properties: TextProperites!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    id: ID!
    """
    The FIXED id for an account
    """
    accountId: ID!
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
    """
    The ID of the entity's version timeline. Null if this is a non-versioned entity.
    """
    historyId: ID
    """
    The version timeline of the entity. Null if this is an non-versioned entity.
    """
    history: [EntityVersion!]
    # ENTITY INTERFACE FIELDS END #
  }

  type TextProperites {
    texts: [TextPropertiesText!]!
  }

  type TextPropertiesText {
    text: String!
    bold: Boolean
    underline: Boolean
    italics: Boolean
  }
`;
