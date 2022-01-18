import { gql } from "@apollo/client";

export const requestFileUpload = gql`
  mutation requestFileUpload(
    $name: String!
    $size: Int!
    $contentMd5: String!
  ) {
    requestFileUpload(name: $name, size: $size, contentMd5: $contentMd5) {
      presignedPost {
        url
        fields
      }
      file {
        accountId
        entityId
      }
    }
  }
`;

export const createFileFromLink = gql`
  mutation createFileFromLink($accountId: ID!, $name: String!, $url: String!) {
    createFileFromLink(accountId: $accountId, name: $name, url: $url) {
      entityId
      properties {
        url
      }
    }
  }
`;
