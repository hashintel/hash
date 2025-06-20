import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const createOrgMutation = gql`
  mutation createOrg($shortname: String!, $name: String!, $websiteUrl: String) {
    createOrg(shortname: $shortname, name: $name, websiteUrl: $websiteUrl) {
      ...SubgraphFields
    }
  }

  ${subgraphFieldsFragment}
`;

export const acceptOrgInvitationMutation = gql`
  mutation acceptOrgInvitation($orgInvitationEntityId: EntityId!) {
    acceptOrgInvitation(orgInvitationEntityId: $orgInvitationEntityId) {
      accepted
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
