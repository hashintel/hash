import { gql } from "apollo-server-express";

export const dataTypeTypedef = gql`
  scalar DataType
  scalar DataTypeWithoutId

  type PersistedDataType {
    """
    The specific versioned URI of the data type
    """
    dataTypeVersionedUri: String!
    """
    The user who created the data type
    """
    accountId: ID!
    """
    The data type
    """
    dataType: DataType!
  }

  extend type Query {
    """
    Get all data types at their latest version.
    """
    getAllLatestDataTypes: [PersistedDataType!]!

    """
    Get a data type by its versioned URI.
    """
    getDataType(dataTypeVersionedUri: String!): PersistedDataType!
  }

  # The following mutations should not be exposed until user defined data types
  # have been described and specified as an RFC.
  # extend type Mutation {
  #   createDataType(accountId: ID!, dataType: DataType!): PersistedDataType!
  #   updateDataType(accountId: ID!, dataType: DataTypeWithoutId!): PersistedDataType!
  # }
`;
