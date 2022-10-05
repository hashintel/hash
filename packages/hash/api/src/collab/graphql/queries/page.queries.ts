import { gql } from "@apollo/client";
import {
  blockFieldsFragment,
  knowledgeBlockFieldsFragment,
} from "./blocks.queries";

export const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    accountId
    entityId
    entityVersionId
    createdAt
    history {
      createdAt
      entityVersionId
    }
    properties {
      __typename
      pageEntityId
      archived
      summary
      title
    }
    contents {
      ...BlockFields
    }
  }
  ${blockFieldsFragment}
`;

export const updatePageContents = gql`
  mutation updatePageContents(
    $accountId: ID!
    $entityId: ID!
    $actions: [UpdatePageAction!]!
  ) {
    updatePageContents(
      accountId: $accountId
      entityId: $entityId
      actions: $actions
    ) {
      page {
        ...PageFields
      }
      placeholders {
        placeholderId
        entityId
      }
    }
  }

  ${pageFieldsFragment}
`;

export const getPageQuery = gql`
  query getPage($accountId: ID!, $entityId: ID, $versionId: ID) {
    page(
      accountId: $accountId
      entityId: $entityId
      entityVersionId: $versionId
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const knowledgePageFieldsFragment = gql`
  fragment KnowledgePageFields on KnowledgePage {
    archived
    summary
    title
    ownedById
    entityId
    entityVersion
    contents {
      ...KnowledgeBlockFields
    }
    __typename
  }
  ${knowledgeBlockFieldsFragment}
`;

export const getKnowledgePageQuery = gql`
  query getKnowledgePage(
    $ownedById: ID!
    $entityId: ID!
    $entityVersion: String
  ) {
    knowledgePage(
      ownedById: $ownedById
      entityId: $entityId
      entityVersion: $entityVersion
    ) {
      ...KnowledgePageFields
    }
  }
  ${knowledgePageFieldsFragment}
`;
