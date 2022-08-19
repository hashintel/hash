import { gql } from "apollo-server-express";

export const dataTypeTypedef = gql`
  scalar DataType

  type PersistedDataType {
    """
    The specific versioned URI of the data type
    """
    dataTypeVersionedUri: String!
    """
    The user who created the data type
    """
    createdBy: ID!
    """
    The data type
    """
    schema: DataType!
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
  #   updateDataType(accountId: ID!, dataType: DataType!): PersistedDataType!
  # }
`;
