import gql from "graphql-tag";

export const createOrg = gql`
  mutation createOrg($org: CreateOrgInput!, $responsibility: String!) {
    createOrg(org: $org, responsibility: $responsibility) {
      __typename
      entityId
      entityTypeName
      createdByAccountId
      createdAt
      updatedAt
      accountId
      visibility
      properties {
        shortname
      }
      linkGroups {
        sourceEntityId
        path
        links {
          linkId
          destinationEntityId
        }
      }
      linkedEntities {
        entityId
        properties
      }
    }
  }
`;

export const createOrgEmailInvitation = gql`
  mutation createOrgEmailInvitation(
    $orgEntityId: ID!
    $inviteeEmailAddress: String!
  ) {
    createOrgEmailInvitation(
      orgEntityId: $orgEntityId
      inviteeEmailAddress: $inviteeEmailAddress
    ) {
      entityId
      properties {
        inviteeEmailAddress
      }
      linkGroups {
        sourceEntityId
        path
        links {
          destinationEntityId
        }
      }
      linkedEntities {
        entityId
        properties
      }
    }
  }
`;

export const orgEmailInvitation = gql`
  query getOrgEmailInvitation(
    $orgEntityId: ID!
    $invitationEmailToken: String!
  ) {
    getOrgEmailInvitation(
      orgEntityId: $orgEntityId
      invitationEmailToken: $invitationEmailToken
    ) {
      entityId
      properties {
        inviteeEmailAddress
      }
      linkGroups {
        sourceEntityId
        path
        links {
          destinationEntityId
        }
      }
      linkedEntities {
        entityId
        properties
      }
    }
  }
`;

export const orgInvitationLink = gql`
  query getOrgInvitationLink($orgEntityId: ID!, $invitationLinkToken: String!) {
    getOrgInvitationLink(
      orgEntityId: $orgEntityId
      invitationLinkToken: $invitationLinkToken
    ) {
      entityId
      linkGroups {
        sourceEntityId
        path
        links {
          destinationEntityId
        }
      }
      linkedEntities {
        entityId
        properties
      }
    }
  }
`;

export const joinOrg = gql`
  mutation joinOrg(
    $orgEntityId: ID!
    $verification: JoinOrgVerification!
    $responsibility: String!
  ) {
    joinOrg(
      orgEntityId: $orgEntityId
      verification: $verification
      responsibility: $responsibility
    ) {
      entityId
      properties {
        emails {
          address
          verified
          primary
        }
      }
      linkGroups {
        path
        sourceEntityId
        links {
          destinationEntityId
        }
      }
    }
  }
`;

export const getAccounts = gql`
  query getAccounts {
    accounts {
      ... on Org {
        properties {
          shortname
        }
        accountId
      }
    }
  }
`;
