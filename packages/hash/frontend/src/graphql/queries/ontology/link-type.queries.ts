import { gql } from "@apollo/client";

export const getLinkType = gql`
  query getLinkType($linkTypeVersionedUri: String!) {
    getLinkType(linkTypeVersionedUri: $linkTypeVersionedUri) {
      linkTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const getAllLatestLinkTypes = gql`
  query getAllLatestLinkTypes {
    getAllLatestLinkTypes {
      linkTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const createLinkType = gql`
  mutation createLinkType($accountId: ID!, $linkType: LinkType!) {
    createLinkType(accountId: $accountId, linkType: $linkType) {
      linkTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const updateLinkType = gql`
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
      createdBy
      schema
    }
  }
`;
