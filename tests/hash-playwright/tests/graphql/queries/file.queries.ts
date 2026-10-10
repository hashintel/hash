export const requestFileUploadMutation = /* GraphQL */ `
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
