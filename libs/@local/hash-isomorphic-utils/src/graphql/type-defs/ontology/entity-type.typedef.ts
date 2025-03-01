import { gql } from "apollo-server-express";

export const entityTypeTypedef = gql`
  scalar ClosedMultiEntityType
  scalar ConstructEntityTypeParams
  scalar EntityTypeWithMetadata
  scalar BaseUrl
  scalar Filter
  scalar UserPermissionsOnEntityType

  type GetClosedMultiEntityTypeResponse {
    closedMultiEntityType: ClosedMultiEntityType!
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
    ): Subgraph!

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
    ): Subgraph!

    getClosedMultiEntityType(
      entityTypeIds: [VersionedUrl!]!
      includeArchived: Boolean = false
      includeDrafts: Boolean = false
    ): GetClosedMultiEntityTypeResponse!

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
      ownedById: OwnedById
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
    updateEntityTypes(
      updates: [EntityTypeUpdate!]!
    ): [EntityTypeWithMetadata!]!

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
