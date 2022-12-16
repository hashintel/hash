import { gql } from "apollo-server-express";

export const entityTypeTypedef = gql`
  scalar EntityTypeWithoutId
  scalar EntityTypeWithMetadata

  extend type Query {
    """
    Get a subgraph rooted at all entity types at their latest version.
    """
    getAllLatestEntityTypes(
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    ): Subgraph!

    """
    Get a subgraph rooted at an entity type resolved by its versioned URI.
    """
    getEntityType(
      entityTypeId: VersionedUri!
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
    ): Subgraph!
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
      entityType: EntityTypeWithoutId!
    ): EntityTypeWithMetadata!

    """
    Update a entity type.
    """
    updateEntityType(
      """
      The entity type versioned $id to update.
      """
      entityTypeId: VersionedUri!
      """
      New entity type schema contents to be used.
      """
      updatedEntityType: EntityTypeWithoutId!
    ): EntityTypeWithMetadata!
  }
`;
