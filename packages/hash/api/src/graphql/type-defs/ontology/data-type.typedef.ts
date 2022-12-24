import { gql } from "apollo-server-express";

export const dataTypeTypedef = gql`
  scalar VersionedUri
  # scalar DataType
  # scalar DataTypeWithoutId
  # scalar DataTypeWithMetadata

  extend type Query {
    """
    Get a subgraph rooted at all data types at their latest version.
    """
    getAllLatestDataTypes(
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    ): Subgraph!

    """
    Get a subgraph rooted at an data type resolved by its versioned URI.
    """
    getDataType(
      dataTypeId: VersionedUri!
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
    ): Subgraph!
  }

  # The following mutations should not be exposed until user defined data types
  # have been described and specified as an RFC.
  # extend type Mutation {
  #   createDataType(accountId: AccountId!, dataType: DataTypeWithoutId!): Subgraph!
  #   updateDataType(accountId: AccountId!, dataType: DataTypeWithoutId!): Subgraph!
  # }
`;
