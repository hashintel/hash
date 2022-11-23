import { gql } from "@apollo/client";

const persistedBlockFieldsFragment = gql`
  fragment PersistedBlockFields on PersistedBlock {
    __typename
    metadata
    blockChildEntity
    properties
  }
`;

const persistedPageFieldsFragment = gql`
  fragment PersistedPageFields on PersistedPage {
    archived
    title
    icon
    summary
    contents {
      ...PersistedBlockFields
    }
    metadata
    properties
    __typename
  }
  ${persistedBlockFieldsFragment}
`;

const persistedPagePropertiesFieldsFragment = gql`
  fragment PersistedPagePropertyFields on PersistedPage {
    title
    archived
    icon
  }
`;

export const getPageInfoQuery = gql`
  query getPageInfo($entityId: EntityId!) {
    persistedPage(entityId: $entityId) {
      metadata
      ...PersistedPagePropertyFields
    }
  }
  ${persistedPagePropertiesFieldsFragment}
`;

export const getPersistedPageQuery = gql`
  query getPersistedPage($entityId: EntityId!) {
    persistedPage(entityId: $entityId) {
      ...PersistedPageFields
    }
  }
  ${persistedPageFieldsFragment}
`;

export const updatePersistedPageContents = gql`
  mutation updatePersistedPageContents(
    $ownedById: ID!
    $entityId: EntityId!
    $actions: [UpdatePersistedPageAction!]!
  ) {
    updatePersistedPageContents(
      ownedById: $ownedById
      entityId: $entityId
      actions: $actions
    ) {
      page {
        ...PersistedPageFields
      }
      placeholders {
        placeholderId
        entityId
      }
    }
  }

  ${persistedPageFieldsFragment}
`;
