import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const createEntityWithMetadataMutation = gql`
  mutation createEntityWithMetadata($entityTypeId: ID!, $properties: JSONObject!) {
    createEntityWithMetadata(
      entityTypeId: $entityTypeId
      properties: $properties
    ) {
      # This is a scalar, which has no selection.
    }
  }
`;

/** @todo - rename these to omit the "WithMetadata" suffix - https://app.asana.com/0/1201095311341924/1203411297593704/f */

export const getEntityWithMetadataQuery = gql`
  query getEntityWithMetadata(
    $entityId: EntityId!
    $entityVersion: String
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $linkTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
    $linkResolveDepth: Int!
    $linkTargetEntityResolveDepth: Int!
  ) {
    getEntityWithMetadata(
      entityId: $entityId
      entityVersion: $entityVersion
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      linkTypeResolveDepth: $linkTypeResolveDepth
      entityTypeResolveDepth: $entityTypeResolveDepth
      linkResolveDepth: $linkResolveDepth
      linkTargetEntityResolveDepth: $linkTargetEntityResolveDepth
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const getAllLatestEntitiesWithMetadataQuery = gql`
  query getAllLatestEntitiesWithMetadata(
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $linkTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
    $linkResolveDepth: Int!
    $linkTargetEntityResolveDepth: Int!
  ) {
    getAllLatestEntitiesWithMetadata(
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      linkTypeResolveDepth: $linkTypeResolveDepth
      entityTypeResolveDepth: $entityTypeResolveDepth
      linkTargetEntityResolveDepth: $linkTargetEntityResolveDepth
      linkResolveDepth: $linkResolveDepth
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;

export const updateEntityWithMetadataMutation = gql`
  mutation updateEntityWithMetadata(
    $entityId: EntityId!
    $updatedProperties: JSONObject!
  ) {
    updateEntityWithMetadata(
      entityId: $entityId
      updatedProperties: $updatedProperties
    ) {
      # This is a scalar, which has no selection.
    }
  }
`;
