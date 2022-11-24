import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const createEntityWithMetadataMutation = gql`
  mutation createEntityWithMetadata(
    $entityTypeId: VersionedUri!
    $properties: JSONObject!
  ) {
    # This is a scalar, which has no selection.
    createEntityWithMetadata(
      entityTypeId: $entityTypeId
      properties: $properties
    )
  }
`;

/** @todo - rename these to omit the "WithMetadata" suffix - https://app.asana.com/0/1201095311341924/1203411297593704/f */

export const getEntityWithMetadataQuery = gql`
  query getEntityWithMetadata(
    $entityId: EntityId!
    $entityVersion: String
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
    $entityResolveDepth: Int!
  ) {
    getEntityWithMetadata(
      entityId: $entityId
      entityVersion: $entityVersion
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      entityTypeResolveDepth: $entityTypeResolveDepth
      entityResolveDepth: $entityResolveDepth
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
    $entityTypeResolveDepth: Int!
    $entityResolveDepth: Int!
  ) {
    getAllLatestEntitiesWithMetadata(
      dataTypeResolveDepth: $dataTypeResolveDepth
      propertyTypeResolveDepth: $propertyTypeResolveDepth
      entityTypeResolveDepth: $entityTypeResolveDepth
      entityResolveDepth: $entityResolveDepth
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
    # This is a scalar, which has no selection.
    updateEntityWithMetadata(
      entityId: $entityId
      updatedProperties: $updatedProperties
    )
  }
`;
