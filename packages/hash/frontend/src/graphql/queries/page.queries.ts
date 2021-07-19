import { gql } from "@apollo/client";

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    id
    accountId
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
  query getPage($accountId: ID!, $pageId: ID!) {
    page(accountId: $accountId, id: $pageId) {
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
  mutation updatePage($accountId: ID!, $id: ID!, $properties: PageUpdateData!) {
    updatePage(accountId: $accountId, id: $id, properties: $properties) {
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
  ) {
    insertBlockIntoPage(
      accountId: $accountId
      componentId: $componentId
      entityType: $entityType
      entityProperties: $entityProperties
      position: $position
      pageId: $pageId
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;
