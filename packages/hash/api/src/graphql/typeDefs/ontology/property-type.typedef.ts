import { gql } from "apollo-server-express";

export const propertyTypeTypedef = gql`
  scalar PropertyType

  type IdentifiedPropertyType {
    propertyTypeVersionedUri: String!
    createdBy: ID!
    schema: PropertyType!
    # TODO: we might need something like
    # "referencedDataTypes: [DataType!]"
    # for us to retrieve all referenced data types, and one for referenced property types as well.
    # This will be helpful for displaying the entire property type in the frontend
  }

  extend type Query {
    """
    Get all property types at their latest version.
    """
    getAllLatestPropertyTypes: [IdentifiedPropertyType!]!

    """
    Get a property type by its versioned URI.
    """
    getPropertyType(propertyTypeVersionedUri: String!): IdentifiedPropertyType!
  }

  extend type Mutation {
    """
    Create a property type.

    accountId refers to the account to create the property type in.
    """
    createPropertyType(
      accountId: ID!
      propertyType: PropertyType!
    ): IdentifiedPropertyType!
    """
    Update a property type.

    accountId refers to the account to update the property type in.
    """
    updatePropertyType(
      accountId: ID!
      propertyType: PropertyType!
    ): IdentifiedPropertyType!
  }
`;
