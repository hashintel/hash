import { gql } from "apollo-server-express";

export const dataTypeTypedef = gql`
  type IdentifiedDataType {
    dataTypeVersionedUri: String!
    createdBy: ID!
    schema: DataType!
  }

  extend type Mutation {
    """
    Create a data type
    """
    createDataType(accountId: ID!, dataType: DataType!): IdentifiedDataType!
  }
`;
