import { gql } from "@apollo/client";
import { blockFieldsFragment } from "./blocks.queries";

export const pageFieldsFragment = gql`
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
    }
    contents {
      ...BlockFields
    }
  }
  ${blockFieldsFragment}
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
      page {
        ...PageFields
      }
      placeholders {
        placeholderId
        entityId
      }
    }
  }

  ${pageFieldsFragment}
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
