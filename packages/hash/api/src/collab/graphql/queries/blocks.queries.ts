import { gql } from "@apollo/client";
import { entityFieldsFragment } from "@hashintel/hash-shared/queries/entity.queries";

export const blockFieldsFragment = gql`
  fragment BlockFields on Block {
    __typename
    id
    entityVersionId
    entityId
    accountId
    updatedAt
    createdAt
    entityVersionCreatedAt
    createdByAccountId
    entityTypeId
    properties {
      __typename
      componentId
      entity {
        ...EntityFields
      }
    }
  }
  ${entityFieldsFragment}
`;

export const getBlocksQuery = gql`
  query getBlocks($blocks: [LatestEntityRef!]!) {
    blocks(blocks: $blocks) {
      ...BlockFields
    }
  }

  ${blockFieldsFragment}
`;

export const persistedBlockFieldsFragment = gql`
  fragment PersistedBlockFields on PersistedBlock {
    __typename
    entityId
    entityVersion
    accountId
    entityTypeId
    componentId
    dataEntity {
      entityId
      accountId
      properties
    }
    properties
    # Not fetching Data Entity yet.
  }
`;
