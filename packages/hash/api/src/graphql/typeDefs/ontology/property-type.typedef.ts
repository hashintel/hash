import { gql } from "apollo-server-express";

export const propertyTypeTypedef = gql`
  scalar PropertyType

  type PersistedPropertyType {
    propertyTypeVersionedUri: String!
    createdBy: ID!
    schema: PropertyType!
    # TODO: we might need something like
    # "referencedDataTypes: [PersistedDataType!]"
    # for us to retrieve all referenced data types, and one for referenced property types as well.
    # This will be helpful for displaying the entire property type in the frontend
  }

  extend type Query {
    """
    Get all property types at their latest version.
    """
    getAllLatestPropertyTypes: [PersistedPropertyType!]!

    """
    Get a property type by its versioned URI.
    """
    getPropertyType(propertyTypeVersionedUri: String!): PersistedPropertyType!
  }

  extend type Mutation {
    """
    Create a property type.
    """
    createPropertyType(
      """
      accountId refers to the account to create the property type in.
      """
      accountId: ID!
      propertyType: PropertyType!
    ): PersistedPropertyType!

    """
    Update a property type.
    """
    updatePropertyType(
      """
      accountId refers to the account to update the property type in.
      """
      accountId: ID!
      propertyType: PropertyType!
    ): PersistedPropertyType!
  }
`;
