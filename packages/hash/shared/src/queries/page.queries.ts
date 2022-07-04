import { gql } from "@apollo/client";

export const getPageInfoQuery = gql`
  query getPageInfo($accountId: ID!, $entityId: ID!, $versionId: ID) {
    page(
      accountId: $accountId
      entityId: $entityId
      entityVersionId: $versionId
    ) {
      entityId
      properties {
        title
        archived
        pageEntityId
      }
    }
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
    }
  }
`;
