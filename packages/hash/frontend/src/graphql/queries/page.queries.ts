import { gql } from "@apollo/client";

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    id
    accountId
    createdAt
    metadataId
    history {
      createdAt
      entityId
    }
    properties {
      __typename
      archived
      summary
      title
      contents {
        id
        accountId
        properties {
          componentId
          entityType
          entity {
            __typename
            id
            accountId
            type
            ... on UnknownEntity {
              unknownProperties: properties
            }
            ... on Text {
              textProperties: properties {
                texts {
                  text
                  bold
                  underline
                  italics
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const getPageQuery = gql`
  query getPage($accountId: ID!, $metadataId: ID, $versionId: ID) {
    page(accountId: $accountId, metadataId: $metadataId, id: $versionId) {
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
    $id: ID!
    $metadataId: ID!
    $properties: PageUpdateData!
  ) {
    updatePage(
      accountId: $accountId
      id: $id
      metadataId: $metadataId
      properties: $properties
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const insertBlockIntoPage = gql`
  mutation insertBlockIntoPage(
    $accountId: ID!
    $componentId: ID!
    $entityType: String!
    $entityProperties: JSONObject!
    $position: Int!
    $pageId: ID!
    $pageMetadataId: ID!
    $versioned: Boolean! = true
  ) {
    insertBlockIntoPage(
      accountId: $accountId
      componentId: $componentId
      entityType: $entityType
      entityProperties: $entityProperties
      position: $position
      pageId: $pageId
      pageMetadataId: $pageMetadataId
      versioned: $versioned
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const insertBlocksIntoPage = gql`
  mutation insertBlocksIntoPage(
    $accountId: ID!
    $pageId: ID!
    $pageMetadataId: ID!
    $blocks: [InsertBlocksData!]!
    $previousBlockId: ID
  ) {
    insertBlocksIntoPage(
      accountId: $accountId
      pageId: $pageId
      pageMetadataId: $pageMetadataId
      blocks: $blocks
      previousBlockId: $previousBlockId
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;
