import { gql } from "graphql-tag";

export const entityTypeTypedef = gql`
  scalar QueryEntityTypesParams
  scalar QueryEntityTypesResponse
  scalar QueryEntityTypeSubgraphParams
  scalar QueryEntityTypeSubgraphResponse
  scalar GetClosedMultiEntityTypesParams
  scalar GetClosedMultiEntityTypesResponse
  scalar ClosedMultiEntityType
  scalar ConstructEntityTypeParams
  scalar EntityTypeWithMetadata
  scalar BaseUrl
  scalar Filter
  scalar UserPermissionsOnEntityType

  extend type Query {
    queryEntityTypes(
      request: QueryEntityTypesParams!
    ): QueryEntityTypesResponse!

    queryEntityTypeSubgraph(
      request: QueryEntityTypeSubgraphParams!
    ): QueryEntityTypeSubgraphResponse!

    getClosedMultiEntityTypes(
      request: GetClosedMultiEntityTypesParams!
    ): GetClosedMultiEntityTypesResponse!

    """
    Check the requesting user's permissions on an entity type
    """
    checkUserPermissionsOnEntityType(
      entityTypeId: VersionedUrl!
    ): UserPermissionsOnEntityType!
  }

  input EntityTypeUpdate {
    entityTypeId: VersionedUrl!
    updatedEntityType: ConstructEntityTypeParams!
  }

  extend type Mutation {
    """
    Create a entity type.
    """
    createEntityType(
      """
      The id of the account who owns the entity type. Defaults to the user calling the mutation.
      """
      webId: WebId
      entityType: ConstructEntityTypeParams!
    ): EntityTypeWithMetadata!

    """
    Update a entity type.
    """
    updateEntityType(
      """
      The entity type versioned $id to update.
      """
      entityTypeId: VersionedUrl!
      """
      New entity type schema contents to be used.
      """
      updatedEntityType: ConstructEntityTypeParams!
    ): EntityTypeWithMetadata!

    """
    Update multiple entity types at once.
    """
    updateEntityTypes(updates: [EntityTypeUpdate!]!): [EntityTypeWithMetadata!]!

    """
    Archive a entity type.
    """
    archiveEntityType(
      """
      The entity type versioned $id to archive.
      """
      entityTypeId: VersionedUrl!
    ): OntologyTemporalMetadata!

    """
    Unarchive a entity type.
    """
    unarchiveEntityType(
      """
      The entity type versioned $id to unarchive.
      """
      entityTypeId: VersionedUrl!
    ): OntologyTemporalMetadata!
  }
`;
