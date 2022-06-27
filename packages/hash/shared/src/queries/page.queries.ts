import { gql } from "@apollo/client";

export const getPageTitleQuery = gql`
  query getPageTitle($accountId: ID!, $entityId: ID!, $versionId: ID) {
    page(
      accountId: $accountId
      entityId: $entityId
      entityVersionId: $versionId
    ) {
      entityId
      properties {
        title
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

export const archivePage = gql`
  mutation archivePage($accountId: ID!, $pageEntityId: ID!) {
    archivePage(accountId: $accountId, pageEntityId: $pageEntityId) {
      accountId
      entityId
      properties {
        title
      }
    }
  }
`;
