import { gql } from "apollo-server-express";

export const propertyTypeTypedef = gql`
  scalar QueryPropertyTypesParams
  scalar QueryPropertyTypesResponse
  scalar QueryPropertyTypeSubgraphParams
  scalar QueryPropertyTypeSubgraphResponse
  scalar ConstructPropertyTypeParams
  scalar PropertyTypeWithMetadata
  scalar OntologyTemporalMetadata

  extend type Query {
    queryPropertyTypes(
      request: QueryPropertyTypesParams!
    ): QueryPropertyTypesResponse!

    queryPropertyTypeSubgraph(
      request: QueryPropertyTypeSubgraphParams!
    ): QueryPropertyTypeSubgraphResponse!
  }

  extend type Mutation {
    """
    Create a property type.
    """
    createPropertyType(
      """
      The id of the account who owns the property type. Defaults to the user calling the mutation.
      """
      webId: WebId
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
