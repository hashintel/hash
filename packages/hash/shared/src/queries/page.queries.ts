import { gql } from "@apollo/client";

const blockFieldsFragment = gql`
  fragment BlockFields on Block {
    __typename
    metadata
    properties
    blockChildEntity
    componentId
  }
`;

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    archived
    title
    icon
    summary
    contents {
      ...BlockFields
    }
    metadata
    properties
    __typename
  }
  ${blockFieldsFragment}
`;

const pagePropertiesFieldsFragment = gql`
  fragment PagePropertyFields on Page {
    title
    archived
    icon
  }
`;

export const getPageInfoQuery = gql`
  query getPageInfo($entityId: EntityId!) {
    page(entityId: $entityId) {
      metadata
      ...PagePropertyFields
    }
  }
  ${pagePropertiesFieldsFragment}
`;

export const getPageQuery = gql`
  query getPage($entityId: EntityId!) {
    page(entityId: $entityId) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const updatePageContents = gql`
  mutation updatePageContents(
    $entityId: EntityId!
    $actions: [UpdatePageAction!]!
  ) {
    updatePageContents(entityId: $entityId, actions: $actions) {
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
