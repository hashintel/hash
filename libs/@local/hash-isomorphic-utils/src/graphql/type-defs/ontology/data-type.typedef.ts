import { gql } from "apollo-server-express";

export const dataTypeTypedef = gql`
  scalar ConstructDataTypeParams
  scalar DataTypeWithMetadata
  scalar DataTypeDirectConversionsMap
  scalar DataTypeFullConversionTargetsMap

  scalar UserPermissionsOnDataType

  extend type Query {
    """
    Get a subgraph rooted at all data types that match a given filter.
    """
    queryDataTypes(
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      filter: Filter
      inheritsFrom: OutgoingEdgeResolveDepthInput!
      includeArchived: Boolean = false
      latestOnly: Boolean = true
    ): Subgraph!

    """
    Get a subgraph rooted at an data type resolved by its versioned URL.
    """
    getDataType(
      dataTypeId: VersionedUrl!
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      includeArchived: Boolean = false
    ): Subgraph!

    getDataTypeConversionTargets(
      dataTypeIds: [VersionedUrl!]!
    ): DataTypeFullConversionTargetsMap!

    """
    Check the requesting user's permissions on a data type
    """
    checkUserPermissionsOnDataType(
      dataTypeId: VersionedUrl!
    ): UserPermissionsOnDataType!
  }


  extend type Mutation {
    createDataType(ownedById: OwnedById!, dataType: ConstructDataTypeParams!, conversions: DataTypeDirectConversionsMap): DataTypeWithMetadata!
    updateDataType(dataTypeId: VersionedUrl!, dataType: ConstructDataTypeParams!, conversions: DataTypeDirectConversionsMap): DataTypeWithMetadata!
    archiveDataType(dataTypeId: VersionedUrl!): OntologyTemporalMetadata!
    unarchiveDataType(dataTypeId: VersionedUrl!): OntologyTemporalMetadata!
  }
`;
