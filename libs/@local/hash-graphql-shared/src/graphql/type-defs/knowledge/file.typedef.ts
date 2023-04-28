import { gql } from "apollo-server-express";

export const fileTypedef = gql`
  type RequestFileUploadResponse {
    """
    Presigned post object containing the info needed to send a POST request
    """
    presignedPost: PresignedFormPost!
    """
    The file Entity
    """
    entity: Entity!
  }

  """
  Presigned data to send a POST request to upload a file
  The fields object contains form parameters that need to be sent with the POST request to upload a file
  """
  type PresignedFormPost {
    """
    url to POST the file to
    """
    url: String!
    """
    form-data fields that need to be appended to the POST request when uploading
    """
    fields: JSONObject!
  }

  extend type Mutation {
    """
    Requests to upload a file, returning the url and data needed
    for a client to POST a file to afterwards
    """
    requestFileUpload(
      """
      Size of the file in bytes
      """
      size: Int!
      """
      mediaType of the file
      """
      mediaType: String!
    ): RequestFileUploadResponse!
    """
    Creates a file entity from an external link. The file entity will just have
    a reference to the link (the file isn't fetched by our server in this current version)
    """
    createFileFromUrl(
      """
      url of the external file
      """
      url: String!
      """
      mediaType of the file
      """
      mediaType: String!
    ): Entity!
  }
`;
