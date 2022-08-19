import { gql } from "apollo-server-express";

export const propertyTypeTypedef = gql`
  scalar PropertyType

  type PersistedPropertyType {
    """
    The specific versioned URI of the property type
    """
    propertyTypeVersionedUri: String!
    """
    The user who created the property type
    """
    createdBy: ID!
    """
    The property type
    """
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
      The id of the account where to create the property type in. Defaults to the account id of the current user.
      """
      accountId: ID
      propertyType: PropertyType!
    ): PersistedPropertyType!

    """
    Update a property type.
    """
    updatePropertyType(
      """
      The id of the account where to create the updated property type in. Defaults to the account id of the current user.
      """
      accountId: ID
      """
      The property type versioned $id to update.
      """
      propertyTypeVersionedUri: String!
      """
      New property type schema contents to be used.
      """
      updatedPropertyType: PropertyType!
    ): PersistedPropertyType!
  }
`;
