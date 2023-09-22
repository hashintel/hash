import { gql } from "apollo-server-express";

export const propertyTypeTypedef = gql`
  scalar ConstructPropertyTypeParams
  scalar PropertyTypeWithMetadata
  scalar OntologyTemporalMetadata

  extend type Query {
    """
    Get a subgraph rooted at all property types that match a given filter.
    """
    queryPropertyTypes(
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      latestOnly: Boolean = true
      includeArchived: Boolean = false
    ): Subgraph!

    """
    Get a subgraph rooted at an property type resolved by its versioned URL.
    """
    getPropertyType(
      propertyTypeId: VersionedUrl!
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
    ): Subgraph!
  }

  extend type Mutation {
    """
    Create a property type.
    """
    createPropertyType(
      """
      The id of the account who owns the property type. Defaults to the user calling the mutation.
      """
      ownedById: OwnedById
      propertyType: ConstructPropertyTypeParams!
    ): PropertyTypeWithMetadata!

    """
    Update a property type.
    """
    updatePropertyType(
      """
      The property type versioned $id to update.
      """
      propertyTypeId: VersionedUrl!
      """
      New property type schema contents to be used.
      """
      updatedPropertyType: ConstructPropertyTypeParams!
    ): PropertyTypeWithMetadata!

    """
    Archive a property type.
    """
    archivePropertyType(
      """
      The property type versioned $id to archive.
      """
      propertyTypeId: VersionedUrl!
    ): OntologyTemporalMetadata!

    """
    Unarchive a property type.
    """
    unarchivePropertyType(
      """
      The property type versioned $id to unarchive.
      """
      propertyTypeId: VersionedUrl!
    ): OntologyTemporalMetadata!
  }
`;
