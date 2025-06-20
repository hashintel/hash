import { gql } from "apollo-server-express";

export const orgTypedef = gql`
  type AcceptInvitationResult {
    accepted: Boolean!
    expired: Boolean!
    notForUser: Boolean!
  }

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
  }
`;
