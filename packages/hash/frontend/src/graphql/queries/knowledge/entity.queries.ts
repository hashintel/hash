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

export const getPersistedEntity = gql`
  query getPersistedEntity($entityId: ID!, $entityVersion: String) {
    persistedEntity(entityId: $entityId, entityVersion: $entityVersion) {
      ...PersistedEntityFields
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
