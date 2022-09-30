import { gql } from "@apollo/client";

export const getLinkTypeQuery = gql`
  query getLinkType($linkTypeId: String!) {
    getLinkType(linkTypeId: $linkTypeId) {
      linkTypeId
      ownedById
      linkType
    }
  }
`;

export const getAllLatestLinkTypesQuery = gql`
  query getAllLatestLinkTypes {
    getAllLatestLinkTypes {
      linkTypeId
      ownedById
      linkType
    }
  }
`;

export const createLinkTypeMutation = gql`
  mutation createLinkType($ownedById: ID!, $linkType: LinkTypeWithoutId!) {
    createLinkType(ownedById: $ownedById, linkType: $linkType) {
      linkTypeId
      ownedById
      linkType
    }
  }
`;

export const updateLinkTypeMutation = gql`
  mutation updateLinkType(
    $linkTypeId: String!
    $updatedLinkType: LinkTypeWithoutId!
  ) {
    updateLinkType(linkTypeId: $linkTypeId, updatedLinkType: $updatedLinkType) {
      linkTypeId
      ownedById
      linkType
    }
  }
`;
