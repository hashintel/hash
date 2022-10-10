import { gql } from "@apollo/client";

export const setParentPage = gql`
  mutation setParentPage(
    $pageEntityId: ID!
    $parentPageEntityId: ID
    $prevIndex: String
    $nextIndex: String
  ) {
    setParentPersistedPage(
      pageEntityId: $pageEntityId
      parentPageEntityId: $parentPageEntityId
      prevIndex: $prevIndex
      nextIndex: $nextIndex
    ) {
      ownedById
      title
      summary
      __typename
    }
  }
`;

export const createPersistedPage = gql`
  mutation createPersistedPage(
    $ownedById: ID!
    $properties: PersistedPageCreationData!
  ) {
    createPersistedPage(ownedById: $ownedById, properties: $properties) {
      ownedById
      entityId
    }
  }
`;

export const updatePersistedPage = gql`
  mutation updatePersistedPage(
    $entityId: ID!
    $updatedProperties: PersistedPageUpdateData!
  ) {
    updatePersistedPage(
      entityId: $entityId
      updatedProperties: $updatedProperties
    ) {
      ownedById
      entityId
    }
  }
`;

export const commentFieldsFragment = gql`
  fragment CommentFields on Comment {
    accountId
    entityId
    tokens
    createdAt
    textUpdatedAt
    author {
      entityId
      properties {
        preferredName
      }
    }
    parent {
      entityId
    }
  }
`;

export const getPageComments = gql`
  query getPageComments($accountId: ID!, $pageId: ID!) {
    pageComments(accountId: $accountId, pageId: $pageId) {
      ...CommentFields
      replies {
        ...CommentFields
      }
    }
  }
  ${commentFieldsFragment}
`;
