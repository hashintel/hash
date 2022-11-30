import { gql } from "apollo-server-express";

export const deprecatedTypedef = gql`
  type File {
    """
    Name of the file
    """
    name: String!
    """
    Key of the file on the storage bucket
    """
    key: String!
    """
    Size of the file in bytes
    """
    size: Int!
    """
    url to download the file. Not statically present but generated at query time (presigned S3 GET url)
    """
    url: String!
    """
    Type of storage used for this file. Necessary to know how to retrieve the file
    """
    storageType: StorageType!
    """
    md5 hash of the file
    """
    contentMd5: String
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

  enum StorageType {
    AWS_S3
    EXTERNAL_LINK
    LOCAL_FILE_SYSTEM
  }
  extend type Mutation {
    # Requests to upload a file, returning the url and data needed
    # for a client to POST a file to afterwards
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
    # Creates a file entity from an external link. The file entity
    # will just have a reference to the link (the file isn't fetched by our server in this current version)
    createFileFromLink(
      """
      Account id under which to associate the file
      """
      accountId: ID!
      """
      url of the external file
      """
      url: String!
      """
      The name of the file (optional, will guess from the URL if not provided)
      """
      name: String
    ): File!
  }

  scalar UnknownEntityProperties

  type UnknownEntity {
    properties: UnknownEntityProperties!

    """
    The id of the entity - alias of 'entityId'
    """
    id: ID!
    """
    The id of the entity - alias of 'id'
    """
    entityId: ID!
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
    createdByAccountId: ID!
    """
    The date the entity was last updated
    """
    updatedAt: Date!
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
    The linked entities of the entity.
    """
    linkedEntities: [UnknownEntity!]!
  }

  type LinkedAggregation {
    aggregationId: ID!
    sourceAccountId: ID!
    sourceEntityId: ID!
    path: String!
    operation: AggregateOperation!
    results: [UnknownEntity!]!
  }

  type AggregationResponse {
    operation: AggregateOperation!
    results: [UnknownEntity!]!
  }

  type AggregateOperation {
    entityTypeId: ID
    entityTypeVersionId: ID
    multiFilter: MultiFilterOperation
    multiSort: [SortOperation!]
    itemsPerPage: Int!
    pageNumber: Int!
    pageCount: Int!
  }

  type SortOperation {
    field: String!
    desc: Boolean
  }

  type MultiFilterOperation {
    filters: [FilterOperation!]!
    operator: String!
  }

  type FilterOperation {
    field: String!
    value: String
    operator: String!
  }

  input AggregateOperationInput {
    entityTypeId: ID
    entityTypeVersionId: ID
    multiFilter: MultiFilterOperationInput
    multiSort: [SortOperationInput!]
    itemsPerPage: Int = 10
    pageNumber: Int = 1
  }

  input SortOperationInput {
    field: String!
    desc: Boolean = false
  }

  input MultiFilterOperationInput {
    filters: [FilterOperationInput!]!
    operator: String!
  }

  input FilterOperationInput {
    field: String!
    value: String
    operator: String!
  }

  extend type Query {
    """
    Aggregate an entity
    """
    aggregateEntity(
      accountId: ID!
      operation: AggregateOperationInput!
    ): AggregationResponse!

    """
    Retrieve a linked aggregation
    """
    getLinkedAggregation(
      sourceAccountId: ID!
      aggregationId: ID!
    ): LinkedAggregation!
  }

  extend type Mutation {
    """
    Create a linked aggregation for an entity
    """
    createLinkedAggregation(
      sourceAccountId: ID!
      sourceEntityId: ID!
      path: String!
      operation: AggregateOperationInput!
    ): LinkedAggregation!
    """
    Update the operation of an entity's linked aggregation
    """
    updateLinkedAggregationOperation(
      sourceAccountId: ID!
      aggregationId: ID!
      updatedOperation: AggregateOperationInput!
    ): LinkedAggregation!
    """
    Delete an entity's linked aggregation
    """
    deleteLinkedAggregation(sourceAccountId: ID!, aggregationId: ID!): Boolean!
  }

  type Link {
    """
    The id of the link.
    """
    linkId: ID!
    """
    The JSON path where the link occurs on its source entity's properties.
    """
    path: String!
    """
    The index of the link (if any)
    """
    index: Int
    """
    The accountId of the link's source entity.
    """
    sourceAccountId: ID!
    """
    The entityId of the link's source entity.
    """
    sourceEntityId: ID!
    """
    The accountId of the link's source entity.
    """
    destinationAccountId: ID!
    """
    The entityId of the link's destination entity.
    """
    destinationEntityId: ID!
  }

  input CreateLinkInput {
    path: String!
    index: Int
    sourceAccountId: ID!
    sourceEntityId: ID!
    destinationAccountId: ID!
    destinationEntityId: ID!
  }

  extend type Query {
    """
    Retrieve a link
    """
    getLink(sourceAccountId: ID!, linkId: ID!): Link!
  }

  extend type Mutation {
    """
    Create a link
    """
    createLink(link: CreateLinkInput!): Link!
    """
    Delete a link using its id
    """
    deleteLink(sourceAccountId: ID!, linkId: ID!): Boolean!
  }
`;

export const _aggregationTypedef = gql`
  type LinkedAggregation {
    aggregationId: ID!
    sourceAccountId: ID!
    sourceEntityId: ID!
    path: String!
    operation: AggregateOperation!
    results: [UnknownEntity!]!
  }

  type AggregationResponse {
    operation: AggregateOperation!
    results: [UnknownEntity!]!
  }

  type AggregateOperation {
    entityTypeId: ID
    entityTypeVersionId: ID
    multiFilter: MultiFilterOperation
    multiSort: [SortOperation!]
    itemsPerPage: Int!
    pageNumber: Int!
    pageCount: Int!
  }

  type SortOperation {
    field: String!
    desc: Boolean
  }

  type MultiFilterOperation {
    filters: [FilterOperation!]!
    operator: String!
  }

  type FilterOperation {
    field: String!
    value: String
    operator: String!
  }

  input AggregateOperationInput {
    entityTypeId: ID
    entityTypeVersionId: ID
    multiFilter: MultiFilterOperationInput
    multiSort: [SortOperationInput!]
    itemsPerPage: Int = 10
    pageNumber: Int = 1
  }

  input SortOperationInput {
    field: String!
    desc: Boolean = false
  }

  input MultiFilterOperationInput {
    filters: [FilterOperationInput!]!
    operator: String!
  }

  input FilterOperationInput {
    field: String!
    value: String
    operator: String!
  }

  extend type Query {
    """
    Aggregate an entity
    """
    aggregateEntity(
      accountId: ID!
      operation: AggregateOperationInput!
    ): AggregationResponse!

    """
    Retrieve a linked aggregation
    """
    getLinkedAggregation(
      sourceAccountId: ID!
      aggregationId: ID!
    ): LinkedAggregation!
  }

  extend type Mutation {
    """
    Create a linked aggregation for an entity
    """
    createLinkedAggregation(
      sourceAccountId: ID!
      sourceEntityId: ID!
      path: String!
      operation: AggregateOperationInput!
    ): LinkedAggregation!
    """
    Update the operation of an entity's linked aggregation
    """
    updateLinkedAggregationOperation(
      sourceAccountId: ID!
      aggregationId: ID!
      updatedOperation: AggregateOperationInput!
    ): LinkedAggregation!
    """
    Delete an entity's linked aggregation
    """
    deleteLinkedAggregation(sourceAccountId: ID!, aggregationId: ID!): Boolean!
  }
`;
