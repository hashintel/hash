import { gql } from "@apollo/client";

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

export const getPersistedEntityQuery = gql`
  query getPersistedEntity($entityId: ID!, $entityVersion: String) {
    persistedEntity(entityId: $entityId, entityVersion: $entityVersion) {
      ...PersistedEntityFields
    }
  }
  ${persistedEntityFieldsFragment}
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
