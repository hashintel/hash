import { gql } from "apollo-server-express";

export const dataTypeTypedef = gql`
  scalar DataType
  scalar DataTypeWithoutId

  type PersistedDataType {
    """
    The specific versioned URI of the data type
    """
    dataTypeId: String!
    """
    The id of the account that owns this data type.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this data type.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
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
    getDataType(dataTypeId: String!): PersistedDataType!
  }

  # The following mutations should not be exposed until user defined data types
  # have been described and specified as an RFC.
  # extend type Mutation {
  #   createDataType(accountId: ID!, dataType: DataTypeWithoutId!): PersistedDataType!
  #   updateDataType(accountId: ID!, dataType: DataTypeWithoutId!): PersistedDataType!
  # }
`;
