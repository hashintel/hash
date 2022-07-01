import { gql } from "apollo-server-express";

export const orgEmailInvitationTypedef = gql`
  type OrgEmailInvitationProperties {
    inviteeEmailAddress: String!
  }

  type OrgEmailInvitation implements Entity {
    properties: OrgEmailInvitationProperties!

    org: Org!

    inviter: User!

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

  extend type Query {
    """
    Get an org email invitation
    """
    getOrgEmailInvitation(
      orgEntityId: ID!
      """
      The token associated with the email invitation
      """
      invitationEmailToken: String!
    ): OrgEmailInvitation!
  }

  extend type Mutation {
    """
    Create an email invitation for an existing organization
    """
    createOrgEmailInvitation(
      """
      The entityId of the organization
      """
      orgEntityId: ID!
      """
      The email address of the invited user
      """
      inviteeEmailAddress: String!
    ): OrgEmailInvitation!
  }
`;
