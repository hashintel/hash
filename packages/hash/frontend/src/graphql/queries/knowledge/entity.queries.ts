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
