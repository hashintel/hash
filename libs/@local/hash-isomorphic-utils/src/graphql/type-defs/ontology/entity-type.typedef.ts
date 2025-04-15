import { gql } from "apollo-server-express";

export const entityTypeTypedef = gql`
  scalar ClosedMultiEntityType
  scalar ConstructEntityTypeParams
  scalar EntityTypeWithMetadata
  scalar BaseUrl
  scalar Filter
  scalar UserPermissionsOnEntityType

  type GetClosedMultiEntityTypesResponse {
    closedMultiEntityTypes: ClosedMultiEntityTypesRootMap!
    definitions: ClosedMultiEntityTypesDefinitions!
  }

  extend type Query {
    """
    Get a subgraph rooted at all entity types that match a given filter.
    """
    queryEntityTypes(
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
      filter: Filter
      inheritsFrom: OutgoingEdgeResolveDepthInput!
      latestOnly: Boolean = true
      includeArchived: Boolean = false
    ): GqlSubgraph!

    """
    Get a subgraph rooted at an entity type resolved by its versioned URL.
    """
    getEntityType(
      entityTypeId: VersionedUrl!
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
      inheritsFrom: OutgoingEdgeResolveDepthInput!
      includeArchived: Boolean = false
    ): GqlSubgraph!

    """
    Get multiple 'closed multi entity types' at once.
    A 'closed multi entity type' is the unified schema from a set of entity types.
    """
    getClosedMultiEntityTypes(
      """
      The list of multi entity type ids to get.
      Each entry in the array should be a set of entity type ids that will generate a closed multi entity type.
      """
      entityTypeIds: [[VersionedUrl!]!]!
      """
      Whether to include archived entity types in the response.
      """
      includeArchived: Boolean = false
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
