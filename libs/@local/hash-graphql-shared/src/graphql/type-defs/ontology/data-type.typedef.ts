import { gql } from "apollo-server-express";

export const dataTypeTypedef = gql`
  scalar VersionedUrl
  # scalar DataType
  # scalar ConstructDataTypeParams
  # scalar DataTypeWithMetadata

  extend type Query {
    """
    Get a subgraph rooted at all data types that match a given filter.
    """
    queryDataTypes(
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    ): Subgraph!

    """
    Get a subgraph rooted at an data type resolved by its versioned URL.
    """
    getDataType(
      dataTypeId: VersionedUrl!
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    ): Subgraph!
  }

  # The following mutations should not be exposed until user defined data types
  # have been described and specified as an RFC.
  # extend type Mutation {
  #   createDataType(accountId: AccountId!, dataType: ConstructDataTypeParams!): Subgraph!
  #   updateDataType(accountId: AccountId!, dataType: ConstructDataTypeParams!): Subgraph!
  # }
`;
