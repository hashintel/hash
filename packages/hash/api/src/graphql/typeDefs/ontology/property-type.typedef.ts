import { gql } from "apollo-server-express";

export const propertyTypeTypedef = gql`
  scalar PropertyType

  type IdentifiedPropertyType {
    propertyTypeVersionedUri: String!
    createdBy: ID!
    schema: PropertyType!
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
