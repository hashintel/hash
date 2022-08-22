import { gql } from "@apollo/client";

export const getLinkTypeQuery = gql`
  query getLinkType($linkTypeVersionedUri: String!) {
    getLinkType(linkTypeVersionedUri: $linkTypeVersionedUri) {
      linkTypeVersionedUri
      accountId
      linkType
    }
  }
`;

export const getAllLatestLinkTypesQuery = gql`
  query getAllLatestLinkTypes {
    getAllLatestLinkTypes {
      linkTypeVersionedUri
      accountId
      linkType
    }
  }
`;

export const createLinkTypeMutation = gql`
  mutation createLinkType($accountId: ID!, $linkType: LinkType!) {
    createLinkType(accountId: $accountId, linkType: $linkType) {
      linkTypeVersionedUri
      accountId
      linkType
    }
  }
`;

export const updateLinkTypeMutation = gql`
  mutation updateLinkType(
    $accountId: ID!
    $linkTypeVersionedUri: String!
    $updatedLinkType: LinkType!
  ) {
    updateLinkType(
      accountId: $accountId
      linkTypeVersionedUri: $linkTypeVersionedUri
      updatedLinkType: $updatedLinkType
    ) {
      linkTypeVersionedUri
      accountId
      linkType
    }
  }
`;
