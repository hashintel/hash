import { gql } from "@apollo/client";

export const getEntityTypeQuery = gql`
  query getEntityType($entityTypeId: String!) {
    getEntityType(entityTypeId: $entityTypeId) {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth(depth: 0)
        propertyTypeResolveDepth(depth: 0)
        linkTypeResolveDepth(depth: 0)
        entityTypeResolveDepth(depth: 0)
        linkTargetEntityResolveDepth(depth: 0)
        linkResolveDepth(depth: 0)
      }
    }
  }
`;

export const getAllLatestEntityTypesQuery = gql`
  query getAllLatestEntityTypes {
    getAllLatestEntityTypes {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth(depth: 0)
        propertyTypeResolveDepth(depth: 0)
        linkTypeResolveDepth(depth: 0)
        entityTypeResolveDepth(depth: 0)
        linkTargetEntityResolveDepth(depth: 0)
        linkResolveDepth(depth: 0)
      }
    }
  }
`;

export const getEntityTypeRootedSubgraphQuery = gql`
  query getEntityTypeRootedSubgraph(
    $entityTypeId: String!
    $dataTypeResolveDepth: Int
    $propertyTypeResolveDepth: Int
    $linkTypeResolveDepth: Int
    $entityTypeResolveDepth: Int
  ) {
    getEntityType(entityTypeId: $entityTypeId) {
      roots
      vertices
      edges
      depths {
        dataTypeResolveDepth(depth: $dataTypeResolveDepth)
        propertyTypeResolveDepth(depth: $propertyTypeResolveDepth)
        linkTypeResolveDepth(depth: $linkTypeResolveDepth)
        entityTypeResolveDepth(depth: $entityTypeResolveDepth)
        linkTargetEntityResolveDepth(depth: 0)
        linkResolveDepth(depth: 0)
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
