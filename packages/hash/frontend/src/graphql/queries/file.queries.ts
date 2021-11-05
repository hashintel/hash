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
        entityId
      }
    }
  }
`;
