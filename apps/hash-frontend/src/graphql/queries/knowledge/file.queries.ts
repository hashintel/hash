import { gql } from "@apollo/client";

export const requestFileUpload = gql`
  mutation requestFileUpload(
    $size: Int!
    $name: String!
    $description: String
    $displayName: String
    $fileEntityCreationInput: FileEntityCreationInput
    $fileEntityUpdateInput: FileEntityUpdateInput
  ) {
    requestFileUpload(
      size: $size
      name: $name
      description: $description
      displayName: $displayName
      fileEntityCreationInput: $fileEntityCreationInput
      fileEntityUpdateInput: $fileEntityUpdateInput
    ) {
      presignedPut {
        url
      }
      entity
    }
  }
`;

export const createFileFromUrl = gql`
  mutation createFileFromUrl(
    $url: String!
    $displayName: String
    $description: String
    $fileEntityCreationInput: FileEntityCreationInput
    $fileEntityUpdateInput: FileEntityUpdateInput
  ) {
    createFileFromUrl(
      url: $url
      displayName: $displayName
      description: $description
      fileEntityCreationInput: $fileEntityCreationInput
      fileEntityUpdateInput: $fileEntityUpdateInput
    )
  }
`;
