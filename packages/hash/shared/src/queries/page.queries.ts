import { gql } from "@apollo/client";

const persistedBlockFieldsFragment = gql`
  fragment PersistedBlockFields on PersistedBlock {
    __typename
    entityId
    entityVersion
    accountId
    entityTypeId
    componentId
    dataEntity {
      entityId
      entityTypeId
      entityVersion
      accountId
      properties
    }
    properties
  }
`;

const persistedPageFieldsFragment = gql`
  fragment PersistedPageFields on PersistedPage {
    archived
    title
    icon
    summary
    ownedById
    entityId
    entityVersion
    contents {
      ...PersistedBlockFields
    }
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
  query getPageInfo($ownedById: ID!, $entityId: ID!, $entityVersion: String) {
    persistedPage(
      ownedById: $ownedById
      entityId: $entityId
      entityVersion: $entityVersion
    ) {
      entityId
      ...PersistedPagePropertyFields
    }
  }
  ${persistedPagePropertiesFieldsFragment}
`;

export const getPersistedPageQuery = gql`
  query getPersistedPage(
    $ownedById: ID!
    $entityId: ID!
    $entityVersion: String
  ) {
    persistedPage(
      ownedById: $ownedById
      entityId: $entityId
      entityVersion: $entityVersion
    ) {
      ...PersistedPageFields
    }
  }
  ${persistedPageFieldsFragment}
`;

export const updatePersistedPageContents = gql`
  mutation updatePersistedPageContents(
    $ownedById: ID!
    $entityId: ID!
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

const pagePropertiesFieldsFragment = gql`
  fragment PagePropertyFields on PageProperties {
    title
    archived
    icon
  }
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
      accountId
      entityId
      properties {
        ...PagePropertyFields
      }
    }
  }
  ${pagePropertiesFieldsFragment}
`;
