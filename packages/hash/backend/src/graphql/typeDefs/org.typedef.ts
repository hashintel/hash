import { gql } from "apollo-server-express";

export const orgTypedef = gql`
  type Org implements Entity {
    properties: OrgProperties!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity
    """
    id: ID!
    """
    The FIXED id for a account
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
    # ENTITY INTERFACE FIELDS END #
  }

  type OrgProperties {
    shortname: String!
  }

  extend type Mutation {
    createOrg(shortname: String!): Org!
  }
`;
