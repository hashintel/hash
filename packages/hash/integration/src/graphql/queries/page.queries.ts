import { gql } from "@apollo/client";

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    entityId
    entityVersionId
    accountId
    createdAt
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
          entity {
            __typename
            id
            accountId
            metadataId
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

export const createPage = gql`
  mutation createPage($accountId: ID!, $properties: PageCreationData!) {
    createPage(accountId: $accountId, properties: $properties) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const insertBlocksIntoPage = gql`
  mutation insertBlocksIntoPage(
    $accountId: ID!
    $entityVersionId: ID!
    $entityId: ID!
    $blocks: [InsertBlocksData!]!
    $previousBlockId: ID
  ) {
    insertBlocksIntoPage(
      accountId: $accountId
      pageMetadataId: $entityId
      pageId: $entityVersionId
      blocks: $blocks
      previousBlockId: $previousBlockId
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const getPage = gql`
  query getPage($accountId: ID!, $entityId: ID, $entityVersionId: ID) {
    page(accountId: $accountId, metadataId: $entityId, id: $entityVersionId) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;
