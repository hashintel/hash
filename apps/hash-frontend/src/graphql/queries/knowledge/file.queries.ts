import { gql } from "@apollo/client";

export const requestFileUpload = gql`
  mutation requestFileUpload($size: Int!, $name: String, $description: String) {
    requestFileUpload(size: $size, name: $name, description: $description) {
      presignedPost {
        url
        fields
      }
      entity
    }
  }
`;

export const createFileFromUrl = gql`
  mutation createFileFromUrl(
    $url: String!
    $name: String
    $description: String
  ) {
    createFileFromUrl(url: $url, name: $name, description: $description)
  }
`;
