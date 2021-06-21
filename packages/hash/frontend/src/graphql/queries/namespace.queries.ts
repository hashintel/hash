import { gql } from "@apollo/client";

export const getNamespaces = gql`
  query getNamespaces {
    namespaces {
      __typename
      ... on User {
        id
        shortname
      }
      ... on Org {
        id
        shortname
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
