import { gql } from "@apollo/client";

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    id
    accountId
    entityVersionId
    createdAt
    entityId
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
        __typename
        id
        entityId
        accountId
        properties {
          __typename
          componentId
          entity
        }
      }
    }
  }
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
