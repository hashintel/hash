import { gql } from "apollo-server-express";

export const fileTypedef = gql`
  type RequestFileUploadResponse {
    """
    Presigned object containing the info needed to send a PUT request
    """
    presignedPut: PresignedPut!
    """
    The file Entity
    """
    entity: Entity!
  }

  """
  Presigned data to send a PUT request to upload a file
  """
  type PresignedPut {
    """
    url to POST the file to
    """
    url: String!
  }

  input FileEntityCreationInput {
    """
    Optionally provide a more specific type for the file entity, which must inherit from @hash's File system type
    """
    entityTypeId: VersionedUrl
    """
    The owner for the created file entity.
    """
    ownedById: OwnedById!
  }

  input FileEntityUpdateInput {
    """
    Optionally provide a more specific type for the file entity, which must inherit from @hash's File system type
    """
    entityTypeId: VersionedUrl
    """
    The entityId of the existing file entity, if this is replacing an existing file
    """
    existingFileEntityId: EntityId!
  }

  extend type Mutation {
    """
    Requests to upload a file, returning the url and data needed
    for a client to POST a file to afterwards
    """
    requestFileUpload(
      """
      An optional description of the file
      """
      description: String
      """
      The original name of the file (e.g. image.png)
      """
      name: String!
      """
      An optional display name for the file
      """
      displayName: String
      """
      Size of the file in bytes
      """
      size: Int!
      """
      Data used to create the file entity, if a new one is required
      """
      fileEntityCreationInput: FileEntityCreationInput
      """
      The entityId of the existing file entity, if this is replacing an existing file
      """
      fileEntityUpdateInput: FileEntityUpdateInput
    ): RequestFileUploadResponse!

    """
    Creates a file entity from an external link. The file entity will just have
    a reference to the link (the file isn't fetched by our server in this current version)
    """
    createFileFromUrl(
      """
      An optional description of the file
      """
      description: String
      """
      An optional display name for the file
      """
      displayName: String
      """
      url of the external file
      """
      url: String!
      """
      Data used to create the file entity, if a new one is required
      """
      fileEntityCreationInput: FileEntityCreationInput
      """
      The entityId of the existing file entity, if this is replacing an existing file
      """
      fileEntityUpdateInput: FileEntityUpdateInput
    ): Entity!
  }
`;
