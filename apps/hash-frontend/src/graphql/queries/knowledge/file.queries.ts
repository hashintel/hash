import { gql } from "@apollo/client";

export const requestFileUpload = gql`
  mutation requestFileUpload(
    $size: Int!
    $name: String!
    $description: String
    $displayName: String
    $entityTypeId: VersionedUrl
    $ownedById: OwnedById
  ) {
    requestFileUpload(
      size: $size
      name: $name
      description: $description
      displayName: $displayName
      entityTypeId: $entityTypeId
      ownedById: $ownedById
    ) {
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
    $displayName: String
    $description: String
    $entityTypeId: VersionedUrl
    $ownedById: OwnedById
  ) {
    createFileFromUrl(
      url: $url
      displayName: $displayName
      description: $description
      entityTypeId: $entityTypeId
      ownedById: $ownedById
    )
  }
`;
