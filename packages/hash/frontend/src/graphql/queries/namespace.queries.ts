import { gql } from "@apollo/client";

export const getNamespaces = gql`
  query getNamespaces {
    namespaces {
      __typename
      ... on Entity {
        id
        namespaceId
      }
      ... on User {
        properties {
          shortname
          email
        }
      }
      ... on Org {
        properties {
          shortname
        }
      }
    }
  }
`;

export const getNamespacePages = gql`
  query getNamespacePages($namespaceId: ID!) {
    namespacePages(namespaceId: $namespaceId) {
      id
      properties {
        title
        summary
      }
    }
  }
`;
