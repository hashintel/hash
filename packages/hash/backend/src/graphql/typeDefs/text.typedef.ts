const { gql } = require("apollo-server-express");

export const textTypedef = gql`
  type Text implements Entity {
    properties: TextProperites!

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
