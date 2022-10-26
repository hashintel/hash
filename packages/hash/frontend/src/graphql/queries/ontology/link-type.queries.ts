import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const getLinkTypeQuery = gql`
  query getLinkType($linkTypeId: String!) {
    getLinkType(linkTypeId: $linkTypeId) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getAllLatestLinkTypesQuery = gql`
  query getAllLatestLinkTypes {
    getAllLatestLinkTypes {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
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
