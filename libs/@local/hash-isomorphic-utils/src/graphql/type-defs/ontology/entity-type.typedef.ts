import { gql } from "apollo-server-express";

export const entityTypeTypedef = gql`
  scalar ConstructEntityTypeParams
  scalar EntityTypeWithMetadata
  scalar BaseUrl
  scalar Filter
  scalar UserPermissionsOnEntityType

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

    """
    Check the requesting user's permissions on an entity type
    """
    checkUserPermissionsOnEntityType(
      entityTypeId: VersionedUrl!
    ): UserPermissionsOnEntityType!
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
      """
      The property which should be used as the label for entities of this type.
      """
      labelProperty: BaseUrl
      """
      The icon to use for the entity type.
      """
      icon: String
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
      """
      The property which should be used as the label for entities of this type.
      """
      labelProperty: BaseUrl
      """
      The icon to use for the entity type.
      """
      icon: String
    ): EntityTypeWithMetadata!

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
