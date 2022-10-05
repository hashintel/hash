import { gql } from "@apollo/client";

export const knowledgeEntityFieldsFragment = gql`
  fragment KnowledgeEntityFields on UnknownKnowledgeEntity {
    entityId
    entityTypeId
    entityVersion
    ownedById
    properties
  }
`;

export const getKnowledgeEntity = gql`
  query getKnowledgeEntity($entityId: ID!, $entityVersion: String) {
    knowledgeEntity(entityId: $entityId, entityVersion: $entityVersion) {
      ...KnowledgeEntityFields
    }
  }
  ${knowledgeEntityFieldsFragment}
`;
