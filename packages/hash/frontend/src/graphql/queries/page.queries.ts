import { gql } from "@apollo/client";

export const getPageQuery = gql`
  query getPage($pageId: ID!) {
    page(id: $pageId) {
      __typename
      id
      properties {
        __typename
        archived
        summary
        title
        contents {
          componentId
          entityType
          entity {
            __typename
            id
            ... on UnknownEntity {
              unknownProperties: properties
            }
            ... on Text {
              textProperties: properties {
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
`;
