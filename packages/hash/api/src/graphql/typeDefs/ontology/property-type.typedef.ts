import { gql } from "apollo-server-express";

export const propertyTypeTypedef = gql`
  scalar PropertyType
  scalar PropertyTypeWithoutId

  interface PropertyTypeInterface {
    # These fields are repeated everywhere they're used because
    # (a) GQL requires it - https://github.com/graphql/graphql-spec/issues/533
    # (b) string interpolation breaks the code generator's introspection
    #
    # Could maybe use a custom schema loader to parse it ourselves:
    # https://www.graphql-code-generator.com/docs/getting-started/schema-field#custom-schema-loader
    #
    # For now, _COPY ANY CHANGES_ from here to any type that 'implements PersistedPropertyTypeInterface'

    """
    The specific versioned URI of the property type
    """
    propertyTypeVersionedUri: String!
    """
    The id of the account that owns this property type.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this property type.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    """
    The property type
    """
    propertyType: PropertyType!
  }

  type PersistedPropertyType implements PropertyTypeInterface {
    # INTERFACE FIELDS BEGIN #
    """
    The specific versioned URI of the property type
    """
    propertyTypeVersionedUri: String!
    """
    The id of the account that owns this property type.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this property type.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    """
    The property type
    """
    propertyType: PropertyType!
    # INTERFACE FIELDS END #
  }

  type PropertyTypeRootedSubgraph implements PropertyTypeInterface {
    """
    Data types referenced directly or indirectly referenced by this property type
    """
    referencedDataTypes(depth: Int): [PersistedDataType!]!
    """
    Property types referenced directly or indirectly referenced by this property type
    """
    referencedPropertyTypes(depth: Int): [PersistedPropertyType!]!

    # INTERFACE FIELDS BEGIN #
    """
    The specific versioned URI of the property type
    """
    propertyTypeVersionedUri: String!
    """
    The id of the account that owns this property type.
    """
    ownedById: ID!
    """
    Alias of ownedById - the id of the account that owns this property type.
    """
    accountId: ID!
      @deprecated(reason: "accountId is deprecated. Use ownedById instead.")
    """
    The property type
    """
    propertyType: PropertyType!
    # INTERFACE FIELDS END #
  }

  extend type Query {
    """
    Get all property types at their latest version.
    """
    getAllLatestPropertyTypes: [PropertyTypeRootedSubgraph!]!

    """
    Get a property type by its versioned URI.
    """
    getPropertyType(
      propertyTypeVersionedUri: String!
    ): PropertyTypeRootedSubgraph!
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
      propertyType: PropertyTypeWithoutId!
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
      updatedPropertyType: PropertyTypeWithoutId!
    ): PersistedPropertyType!
  }
`;
