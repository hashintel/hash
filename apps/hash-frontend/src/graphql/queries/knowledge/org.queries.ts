import { gql } from "@apollo/client";

export const createOrgMutation = gql`
  mutation createOrg($shortname: String!, $name: String!, $websiteUrl: String) {
    createOrg(shortname: $shortname, name: $name, websiteUrl: $websiteUrl)
  }
`;

export const acceptOrgInvitationMutation = gql`
  mutation acceptOrgInvitation($orgInvitationEntityId: EntityId!) {
    acceptOrgInvitation(orgInvitationEntityId: $orgInvitationEntityId) {
      accepted
      alreadyAMember
      expired
      notForUser
    }
  }
`;

export const inviteUserToOrgMutation = gql`
  mutation inviteUserToOrg($orgWebId: WebId!, $userEmail: String, $userShortname: String) {
    inviteUserToOrg(orgWebId: $orgWebId, userEmail: $userEmail, userShortname: $userShortname)
  }
`;

export const declineOrgInvitationMutation = gql`
  mutation declineOrgInvitation($orgInvitationEntityId: EntityId!) {
    declineOrgInvitation(orgInvitationEntityId: $orgInvitationEntityId)
  }
`;

export const removeUserFromOrgMutation = gql`
  mutation removeUserFromOrg($orgWebId: WebId!, $userEntityId: EntityId!) {
    removeUserFromOrg(orgWebId: $orgWebId, userEntityId: $userEntityId)
  }
`;

const pendingInvitationViaEmailFragment = gql`
  fragment PendingInvitationViaEmail on PendingOrgInvitationByEmail {
    email
    invitationEntityId
    orgToInvitationLinkEntityId
    invitedAt
    expiresAt
    invitedBy {
      accountId
      displayName
      shortname
    }
    org {
      webId
      displayName
      shortname
    }
  }
`;

const pendingInvitationViaShortnameFragment = gql`
  fragment PendingInvitationViaShortname on PendingOrgInvitationByShortname {
    shortname
    invitationEntityId
    orgToInvitationLinkEntityId
    invitedAt
    expiresAt
    invitedBy {
      accountId
      displayName
      shortname
    }
    org {
      webId
      displayName
      shortname
    }
  }
`;

export const getPendingInvitationByEntityIdQuery = gql`
  query getPendingInvitationByEntityId($entityId: EntityId!) {
    getPendingInvitationByEntityId(entityId: $entityId) {
      ...PendingInvitationViaEmail
      ...PendingInvitationViaShortname
    }
  }

  ${pendingInvitationViaEmailFragment}
  ${pendingInvitationViaShortnameFragment}
`;

export const getMyPendingInvitationsQuery = gql`
  query getMyPendingInvitations {
    getMyPendingInvitations {
      ...PendingInvitationViaEmail
      ...PendingInvitationViaShortname
    }
  }

  ${pendingInvitationViaEmailFragment}
  ${pendingInvitationViaShortnameFragment}
`;
