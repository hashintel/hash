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

export const createFileFromUrl = gql`
  mutation createFileFromUrl($url: String!, $mediaType: String!) {
    createFileFromUrl(url: $url, mediaType: $mediaType)
  }
`;
