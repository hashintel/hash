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
      # This is a scalar, which has no selection.
    }
  }
`;

export const updateLinkTypeMutation = gql`
  mutation updateLinkType(
    $linkTypeId: String!
    $updatedLinkType: LinkTypeWithoutId!
  ) {
    updateLinkType(linkTypeId: $linkTypeId, updatedLinkType: $updatedLinkType) {
      # This is a scalar, which has no selection.
    }
  }
`;
