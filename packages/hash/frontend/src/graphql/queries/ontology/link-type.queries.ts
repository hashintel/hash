import { gql } from "@apollo/client";

export const getLinkTypeQuery = gql`
  query getLinkType($linkTypeVersionedUri: String!) {
    getLinkType(linkTypeVersionedUri: $linkTypeVersionedUri) {
      linkTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const getAllLatestLinkTypesQuery = gql`
  query getAllLatestLinkTypes {
    getAllLatestLinkTypes {
      linkTypeVersionedUri
      createdBy
      schema
    }
  }
`;

export const createLinkTypeMutation = gql`
  mutation createLinkType($accountId: ID!, $linkType: LinkType!) {
    createLinkType(accountId: $accountId, linkType: $linkType) {
      linkTypeVersionedUri
      createdBy
      schema
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
      createdBy
      schema
    }
  }
`;
