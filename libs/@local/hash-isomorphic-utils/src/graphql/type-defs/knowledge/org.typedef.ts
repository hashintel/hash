import { gql } from "apollo-server-express";

export const orgTypedef = gql`
  type AcceptInvitationResult {
    accepted: Boolean!
    alreadyAMember: Boolean!
    expired: Boolean!
    notForUser: Boolean!
  }

  type MinimalGqlUser {
    accountId: AccountId!
    displayName: String!
    shortname: String!
  }

  type MinimalGqlOrg {
    webId: WebId!
    displayName: String!
    shortname: String!
  }

  type PendingOrgInvitationByEmail {
    email: String!
    invitationEntityId: EntityId!
    orgToInvitationLinkEntityId: EntityId!
    expiresAt: Date!
    invitedBy: MinimalGqlUser!
    invitedAt: Date!
    org: MinimalGqlOrg!
  }

  type PendingOrgInvitationByShortname {
    shortname: String!
    invitationEntityId: EntityId!
    orgToInvitationLinkEntityId: EntityId!
    expiresAt: Date!
    invitedBy: MinimalGqlUser!
    invitedAt: Date!
    org: MinimalGqlOrg!
  }

  union PendingOrgInvitation = PendingOrgInvitationByEmail | PendingOrgInvitationByShortname

  extend type Mutation {
    """
    Create an organization. The creator will be automatically added as an org member.
    """
    createOrg(
      """
      The shortname of the organization.
      """
      shortname: String!
      """
      The name of the organization.
      """
      name: String!
      """
      The website of the organization.
      """
      websiteUrl: String
      """
      The depths that \`hasLeftEntity\` edges are resolved to.
      """
      hasLeftEntity: EdgeResolveDepthsInput! = { outgoing: 0, incoming: 0 }
      """
      The depths that \`hasRightEntity\` edges are resolved to.
      """
      hasRightEntity: EdgeResolveDepthsInput! = { outgoing: 0, incoming: 0 }
    ): GqlSubgraph!

    """
    Invite a user to an organization.
    """
    inviteUserToOrg(
      """
      The email of the user to invite (one of userEmail or userShortname must be provided).
      """
      userEmail: String
      """
      The shortname of the user to invite (one of userEmail or userShortname must be provided).
      """
      userShortname: String
      """
      The webId of the organization to invite the user to.
      """
      orgWebId: WebId!
    ): Boolean!

    """
    Accept an invitation to an organization.
    """
    acceptOrgInvitation(
      """
      The entityId of the organization invitation to accept.
      """
      orgInvitationEntityId: EntityId!
    ): AcceptInvitationResult!

    """
    Decline an invitation to an organization.
    """
    declineOrgInvitation(
      """
      The entityId of the organization invitation to decline.
      """
      orgInvitationEntityId: EntityId!
    ): Boolean!

    """
    Remove a user from an organization.
    """
    removeUserFromOrg(
      """
      The entityId of the organization to remove the user from.
      """
      orgWebId: WebId!
      """
      The entityId of the user to remove from the organization.
      """
      userEntityId: EntityId!
    ): Boolean!
  }

  extend type Query {
    """
    Get a pending invitation by invitation entityId.
    """
    getPendingInvitationByEntityId(
      """
      The entityId of the invitation.
      """
      entityId: EntityId!
    ): PendingOrgInvitation

    """
    Get pending invitations for the authenticated user.
    """
    getMyPendingInvitations: [PendingOrgInvitation!]!
  }
`;
