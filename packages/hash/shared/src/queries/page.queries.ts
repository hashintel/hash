import { gql } from "@apollo/client";

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
