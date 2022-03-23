import { gql } from "@apollo/client";
import { linkedAggregationsFragment } from "./entity.queries";

const linkFieldsFragment = gql`
  fragment LinkFields on Link {
    linkId
    path
    index
    sourceAccountId
    sourceEntityId
    destinationAccountId
    destinationEntityId
    destinationEntityVersionId
  }
`;

const blockFieldsFragment = gql`
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
        properties
        linkGroups {
          links {
            ...LinkFields
          }
          sourceEntityId
          sourceEntityVersionId
          path
        }
        linkedEntities {
          accountId
          entityId
          entityTypeId
          properties
        }
        linkedAggregations {
          ...LinkedAggregationsFields
        }
      }
    }
  }
  ${linkFieldsFragment}
  ${linkedAggregationsFragment}
`;

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    accountId
    entityId
    entityVersionId
    createdAt
    history {
      createdAt
      entityVersionId
    }
    properties {
      __typename
      archived
      summary
      title
      contents {
        ...BlockFields
      }
    }
  }
  ${blockFieldsFragment}
`;

export const getPageQuery = gql`
  query getPage($accountId: ID!, $entityId: ID, $versionId: ID) {
    page(
      accountId: $accountId
      entityId: $entityId
      entityVersionId: $versionId
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const getBlocksQuery = gql`
  query getBlocks($blocks: [LatestEntityRef!]!) {
    blocks(blocks: $blocks) {
      ...BlockFields
    }
  }

  ${blockFieldsFragment}
`;

export const createPage = gql`
  mutation createPage($accountId: ID!, $properties: PageCreationData!) {
    createPage(accountId: $accountId, properties: $properties) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const updatePage = gql`
  mutation updatePage(
    $accountId: ID!
    $entityId: ID!
    $properties: PageUpdateData!
  ) {
    updatePage(
      accountId: $accountId
      entityId: $entityId
      properties: $properties
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const updatePageContents = gql`
  mutation updatePageContents(
    $accountId: ID!
    $entityId: ID!
    $actions: [UpdatePageAction!]!
  ) {
    updatePageContents(
      accountId: $accountId
      entityId: $entityId
      actions: $actions
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const setParentPage = gql`
  mutation setParentPage(
    $accountId: ID!
    $pageEntityId: ID!
    $parentPageEntityId: ID
  ) {
    setParentPage(
      accountId: $accountId
      pageEntityId: $pageEntityId
      parentPageEntityId: $parentPageEntityId
    ) {
      accountId
      entityId
      properties {
        title
        summary
        __typename
      }
      __typename
    }
  }
`;
