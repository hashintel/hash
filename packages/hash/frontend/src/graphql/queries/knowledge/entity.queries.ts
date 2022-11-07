import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "../subgraph";

export const persistedEntityFieldsFragment = gql`
  fragment PersistedEntityFields on UnknownPersistedEntity {
    entityId
    entityTypeId
    entityVersion
    ownedById
    properties
  }
`;

export const createPersistedEntityMutation = gql`
  mutation createPersistedEntity($entityTypeId: ID!, $properties: JSONObject!) {
    createPersistedEntity(
      entityTypeId: $entityTypeId
      properties: $properties
    ) {
      ...PersistedEntityFields
    }
  }
  ${persistedEntityFieldsFragment}
`;

/** @todo - rename these and remove "persisted" - https://app.asana.com/0/0/1203157172269854/f */

export const getPersistedEntityQuery = gql`
  query getPersistedEntity(
    $entityId: ID!
    $entityVersion: String
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
    $entityResolveDepth: Int!
  ) {
    getPersistedEntity(
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
  query getAllLatestPersistedEntities(
    $dataTypeResolveDepth: Int!
    $propertyTypeResolveDepth: Int!
    $entityTypeResolveDepth: Int!
    $entityResolveDepth: Int!
  ) {
    getAllLatestPersistedEntities(
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

export const getOutgoingPersistedLinksQuery = gql`
  query getOutgoingPersistedLinks($sourceEntityId: ID!, $linkTypeId: String) {
    outgoingPersistedLinks(
      sourceEntityId: $sourceEntityId
      linkTypeId: $linkTypeId
    ) {
      ownedById
      linkTypeId
      index
      sourceEntityId
      targetEntityId
      targetEntity {
        ...PersistedEntityFields
      }
    }
  }
  ${persistedEntityFieldsFragment}
`;

export const updatePersistedEntityMutation = gql`
  mutation updatePersistedEntity(
    $entityId: ID!
    $updatedProperties: JSONObject!
  ) {
    updatePersistedEntity(
      entityId: $entityId
      updatedProperties: $updatedProperties
    ) {
      ...PersistedEntityFields
    }
  }
  ${persistedEntityFieldsFragment}
`;
