import { gql } from "@apollo/client";

export const requestFileUpload = gql`
  mutation requestFileUpload(
    $name: String!
    $size: Int!
    $contentMd5: String!
    $mediaType: String!
  ) {
    requestFileUpload(
      name: $name
      size: $size
      contentMd5: $contentMd5
      mediaType: $mediaType
    ) {
      presignedPost {
        url
        fields
      }
      entity
    }
  }
`;

export const createFileFromLink = gql`
  mutation createFileFromLink(
    $accountId: ID!
    $name: String!
    $url: String!
    $mediaType: String!
  ) {
    createFileFromLink(
      accountId: $accountId
      name: $name
      url: $url
      mediaType: $mediaType
    )
  }
`;
