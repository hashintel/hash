import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const createEntityMutation = gql`
  mutation createEntity(
    $entityTypeId: VersionedUri!
    $properties: JSONObject!
  ) {
    # This is a scalar, which has no selection.
    createEntity(entityTypeId: $entityTypeId, properties: $properties)
  }
`;

/** @todo - rename these to omit the "WithMetadata" suffix - https://app.asana.com/0/1201095311341924/1203411297593704/f */

export const getEntityQuery = gql`
  query getEntity(
    $entityId: EntityId!
    $entityVersion: String
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
    $entityResolveDepth: Int!
  ) {
    getEntity(
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

export const getAllLatestEntitiesQuery = gql`
  query getAllLatestEntities(
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
    $entityResolveDepth: Int!
  ) {
    getAllLatestEntities(
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

export const updateEntityMutation = gql`
  mutation updateEntity($entityId: EntityId!, $updatedProperties: JSONObject!) {
    # This is a scalar, which has no selection.
    updateEntity(entityId: $entityId, updatedProperties: $updatedProperties)
  }
`;
