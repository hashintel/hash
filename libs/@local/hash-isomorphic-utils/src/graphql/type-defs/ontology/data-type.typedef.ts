import { gql } from "apollo-server-express";

export const dataTypeTypedef = gql`
  scalar QueryDataTypesParams
  scalar QueryDataTypesResponse
  scalar QueryDataTypeSubgraphParams
  scalar QueryDataTypeSubgraphResponse
  scalar ConstructDataTypeParams
  scalar DataTypeWithMetadata
  scalar DataTypeDirectConversionsMap
  scalar DataTypeFullConversionTargetsMap

  scalar UserPermissionsOnDataType

  extend type Query {
    queryDataTypes(
      request: QueryDataTypesParams!
    ): QueryDataTypesResponse!

    queryDataTypeSubgraph(
      request: QueryDataTypeSubgraphParams!
    ): QueryDataTypeSubgraphResponse!

    findDataTypeConversionTargets(
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
    createDataType(webId: WebId!, dataType: ConstructDataTypeParams!, conversions: DataTypeDirectConversionsMap): DataTypeWithMetadata!
    updateDataType(dataTypeId: VersionedUrl!, dataType: ConstructDataTypeParams!, conversions: DataTypeDirectConversionsMap): DataTypeWithMetadata!
    archiveDataType(dataTypeId: VersionedUrl!): OntologyTemporalMetadata!
    unarchiveDataType(dataTypeId: VersionedUrl!): OntologyTemporalMetadata!
  }
`;
