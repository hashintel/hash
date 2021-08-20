import { gql } from "@apollo/client";

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    id
    entityVersionId
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
