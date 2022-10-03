import { gql } from "@apollo/client";

const knowledgePagePropertiesFieldsFragment = gql`
  fragment KnowledgePagePropertyFields on KnowledgePage {
    title
    archived
    icon
  }
`;

export const getPageInfoQuery = gql`
  query getPageInfo($ownedById: ID!, $entityId: ID!, $entityVersion: String) {
    knowledgePage(
      ownedById: $ownedById
      entityId: $entityId
      entityVersion: $entityVersion
    ) {
      entityId
      ...KnowledgePagePropertyFields
    }
  }
  ${knowledgePagePropertiesFieldsFragment}
`;

const pagePropertiesFieldsFragment = gql`
  fragment PagePropertyFields on PageProperties {
    title
    archived
    icon
  }
`;

export const updatePage = gql`
  mutation updatePage(
    $accountId: ID!
    $entityId: ID!
    $properties: PageUpdateData!
  ) {
    updatePage(
      accountId: $accountId
      entityId: $entityId
      properties: $properties
    ) {
      accountId
      entityId
      properties {
        ...PagePropertyFields
      }
    }
  }
  ${pagePropertiesFieldsFragment}
`;
