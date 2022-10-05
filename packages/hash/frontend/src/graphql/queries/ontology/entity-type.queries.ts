import { gql } from "@apollo/client";

export const getEntityTypeQuery = gql`
  query getEntityType($entityTypeId: String!) {
    getEntityType(entityTypeId: $entityTypeId) {
      entityTypeId
      ownedById
      entityType
    }
  }
`;

export const getAllLatestEntityTypesQuery = gql`
  query getAllLatestEntityTypes {
    getAllLatestEntityTypes {
      entityTypeId
      ownedById
      entityType
    }
  }
`;

export const getEntityTypeRootedSubgraphQuery = gql`
  query getEntityTypeRootedSubgraph(
    $entityTypeId: String!
    $referencedDataTypesDepth: Int
    $referencedPropertyTypesDepth: Int
    $referencedLinkTypesDepth: Int
    $referencedEntityTypesDepth: Int
  ) {
    getEntityType(entityTypeId: $entityTypeId) {
      entityTypeId
      ownedById
      accountId
      entityType
      referencedDataTypes(depth: $referencedDataTypesDepth) {
        dataTypeId
        ownedById
        accountId
        dataType
      }
      referencedPropertyTypes(depth: $referencedPropertyTypesDepth) {
        propertyTypeId
        ownedById
        accountId
        propertyType
      }
      referencedLinkTypes(depth: $referencedLinkTypesDepth) {
        linkTypeId
        ownedById
        accountId
        linkType
      }
      referencedEntityTypes(depth: $referencedEntityTypesDepth) {
        entityTypeId
        ownedById
        accountId
        entityType
      }
    }
  }
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $ownedById: ID!
    $entityType: EntityTypeWithoutId!
  ) {
    createEntityType(ownedById: $ownedById, entityType: $entityType) {
      entityTypeId
      ownedById
      entityType
    }
  }
`;

export const updateEntityTypeMutation = gql`
  mutation updateEntityType(
    $entityTypeId: String!
    $updatedEntityType: EntityTypeWithoutId!
  ) {
    updateEntityType(
      entityTypeId: $entityTypeId
      updatedEntityType: $updatedEntityType
    ) {
      entityTypeId
      ownedById
      entityType
    }
  }
`;
