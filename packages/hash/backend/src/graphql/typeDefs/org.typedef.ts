import { gql } from "apollo-server-express";

export const orgTypedef = gql`
  type Org implements Entity {
    properties: OrgProperties!

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
    The metadata ID of the entity. This is shared across all versions of the same entity.
    """
    metadataId: ID!
    # ENTITY INTERFACE FIELDS END #
  }

  type OrgSizeRange {
    lowerBound: Int!
    upperBound: Int
  }

  type OrgInfoProvidedAtCreation {
    """
    The size of the organization
    """
    orgSize: OrgSizeRange!
  }

  type OrgProperties {
    shortname: String
    name: String!
    infoProvidedAtCreation: OrgInfoProvidedAtCreation!
  }

  input CreateOrgInput {
    shortname: String!
    name: String!
    orgSizeLowerBound: Int!
    orgSizeUpperBound: Int
  }

  extend type Mutation {
    """
    Create a new organization. The user that calls this mutation is automatically added 
    as a member with the provided 'role'.
    """
    createOrg(
      org: CreateOrgInput!,
      """
      The 'role' of the user at the organization.
      """
      role: String!
    ): Org!
  }
`;
