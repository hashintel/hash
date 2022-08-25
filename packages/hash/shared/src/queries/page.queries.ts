import { gql } from "@apollo/client";

const pagePropertiesFieldsFragment = gql`
  fragment PagePropertyFields on PageProperties {
    title
    archived
    pageEntityId
    icon
  }
`;

export const getPageInfoQuery = gql`
  query getPageInfo($accountId: ID!, $entityId: ID!, $versionId: ID) {
    page(
      accountId: $accountId
      entityId: $entityId
      entityVersionId: $versionId
    ) {
      entityId
      properties {
        ...PagePropertyFields
      }
    }
  }
  ${pagePropertiesFieldsFragment}
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
