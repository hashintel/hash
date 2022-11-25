import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const getEntityTypeQuery = gql`
  query getEntityType(
    $entityTypeId: VersionedUri!
    $constrainsValuesOn: Int!
    $constrainsPropertiesOn: Int!
    $constrainsLinksOn: Int!
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getAllLatestEntityTypesQuery = gql`
  query getAllLatestEntityTypes(
    $constrainsValuesOn: Int!
    $constrainsPropertiesOn: Int!
    $constrainsLinksOn: Int!
  ) {
    getAllLatestEntityTypes(
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getEntityTypeRootedSubgraphQuery = gql`
  query getEntityTypeRootedSubgraph(
    $entityTypeId: VersionedUri!
    $constrainsValuesOn: Int!
    $constrainsPropertiesOn: Int!
    $constrainsLinksOn: Int!
  ) {
    getEntityType(
      entityTypeId: $entityTypeId
      constrainsValuesOn: $constrainsValuesOn
      constrainsPropertiesOn: $constrainsPropertiesOn
      constrainsLinksOn: $constrainsLinksOn
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $ownedById: ID!
    $entityType: EntityTypeWithoutId!
  ) {
    # This is a scalar, which has no selection.
    createEntityType(ownedById: $ownedById, entityType: $entityType)
  }
`;

export const updateEntityTypeMutation = gql`
  mutation updateEntityType(
    $entityTypeId: VersionedUri!
    $updatedEntityType: EntityTypeWithoutId!
  ) {
    updateEntityType(
      entityTypeId: $entityTypeId
      updatedEntityType: $updatedEntityType
    )
  }
`;
