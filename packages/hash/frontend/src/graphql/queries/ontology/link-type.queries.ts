import { gql } from "@apollo/client";

export const getLinkTypeQuery = gql`
  query getLinkType($linkTypeVersionedUri: String!) {
    getLinkType(linkTypeVersionedUri: $linkTypeVersionedUri) {
      linkTypeVersionedUri
      ownedById
      linkType
    }
  }
`;

export const getAllLatestLinkTypesQuery = gql`
  query getAllLatestLinkTypes {
    getAllLatestLinkTypes {
      linkTypeVersionedUri
      ownedById
      linkType
    }
  }
`;

export const createLinkTypeMutation = gql`
  mutation createLinkType($ownedById: ID!, $linkType: LinkTypeWithoutId!) {
    createLinkType(ownedById: $ownedById, linkType: $linkType) {
      linkTypeVersionedUri
      ownedById
      linkType
    }
  }
`;

export const updateLinkTypeMutation = gql`
  mutation updateLinkType(
    $linkTypeVersionedUri: String!
    $updatedLinkType: LinkTypeWithoutId!
  ) {
    updateLinkType(
      linkTypeVersionedUri: $linkTypeVersionedUri
      updatedLinkType: $updatedLinkType
    ) {
      linkTypeVersionedUri
      ownedById
      linkType
    }
  }
`;
