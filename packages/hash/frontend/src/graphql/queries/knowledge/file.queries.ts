import { gql } from "@apollo/client";

export const requestFileUpload = gql`
  mutation requestFileUpload($size: Int!, $mediaType: String!) {
    requestFileUpload(size: $size, mediaType: $mediaType) {
      presignedPost {
        url
        fields
      }
      entity
    }
  }
`;

export const createFileFromLink = gql`
  mutation createFileFromLink($url: String!, $mediaType: String!) {
    createFileFromLink(url: $url, mediaType: $mediaType)
  }
`;
