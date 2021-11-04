import { gql } from "apollo-server-express";

export const fileTypedef = gql`
  type File implements Entity {
    # These fields are repeated everywhere they're used because
    # (a) GQL requires it - https://github.com/graphql/graphql-spec/issues/533
    # (b) string interpolation breaks the code generator's introspection
    #
    # Could maybe use a custom schema loader to parse it ourselves:
    # https://www.graphql-code-generator.com/docs/getting-started/schema-field#custom-schema-loader
    #
    # For now, _COPY ANY CHANGES_ from here to any type that 'implements Entity'
    properties: FileProperties!

    # ENTITY INTERFACE FIELDS BEGIN #
    """
    The id of the entity - alias of 'entityId'
    """
    id: ID!
    """
    The id of the entity - alias of 'id'
    """
    entityId: ID!
    """
    The specific version if of the entity
    """
    entityVersionId: ID!
    """
    The id of the account this entity belongs to
    """
    accountId: ID!
    """
    The date the entity was created
    """
    createdAt: Date!
    """
    The date this entity version was created.
    """
    entityVersionCreatedAt: Date!
    """
    The user who created the entity
    """
    createdById: ID!
    """
    The date the entity was last updated
    """
    updatedAt: Date!
    """
    The visibility level of the entity
    """
    visibility: Visibility!
    """
    The fixed id of the type this entity is of
    """
    entityTypeId: ID!
    """
    The id of the specific version of the type this entity is of
    """
    entityTypeVersionId: ID!
    """
    The name of the entity type this belongs to.
    N.B. Type names are unique by account - not globally.
    """
    entityTypeName: String!
    """
    The full entityType definition
    """
    entityType: EntityType!
    """
    The version timeline of the entity.
    """
    history: [EntityVersion!]
    """
    The metadata ID of the entity. This is shared across all versions of the same entity.
    """
    metadataId: ID!
    """
    The outgoing links of the entity.
    """
    links: [Link!]!
    """
    The linked entities of the entity.
    """
    linkedEntities: [Entity!]!
    """
    The linked aggregations of the entity.
    """
    linkedAggregations: [LinkedAggregation!]!
    # ENTITY INTERFACE FIELDS END #
  }

  type FileProperties {
    """
    Name of the file
    """
    name: String!
    """
    Key of the file on the storage bucket
    """
    key: String!
    """
    md5 hash of the file
    """
    contentMd5: String!
    """
    Size of the file in bytes
    """
    size: Int!
    """
    url to download the file. Not statically present but generated at query time (presigned S3 GET url)
    """
    url: String!
    """
    Optional media type, unused for now
    """
    mediaType: String
  }

  type RequestFileUploadResponse {
    """
    Presigned post object containing the info needed to send a POST request
    """
    presignedPost: PresignedFormPost!
    """
    ID of the entity created by the upload request
    """
    file: File!
  }

  # Presigned data to send a POST request to upload a file
  # The fields object contains form parameters that need to be sent with the POST request to upload a file
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
    requestFileUpload(
      """
      The name of the file
      """
      name: String!
      """
      Size of the file in bytes
      """
      size: Int!
      """
      md5 hash of the file
      """
      contentMd5: String!
    ): RequestFileUploadResponse!
  }
`;
