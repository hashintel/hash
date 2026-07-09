import { gql } from "@apollo/client";

export const requestFileUpload = gql`
  mutation requestFileUpload(
    $size: Int!
    $name: String!
    $description: String
    $displayName: String
    $fileEntityCreationInput: FileEntityCreationInput
    $fileEntityUpdateInput: FileEntityUpdateInput
    $makePublic: Boolean = false
  ) {
    requestFileUpload(
      size: $size
      name: $name
      description: $description
      displayName: $displayName
      fileEntityCreationInput: $fileEntityCreationInput
      fileEntityUpdateInput: $fileEntityUpdateInput
      makePublic: $makePublic
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
    $makePublic: Boolean = false
  ) {
    createFileFromUrl(
      url: $url
      displayName: $displayName
      description: $description
      fileEntityCreationInput: $fileEntityCreationInput
      fileEntityUpdateInput: $fileEntityUpdateInput
      makePublic: $makePublic
    )
  }
`;
