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
  fragment CommentFields on PersistedComment {
    ownedById
    entityId
    hasText
    textUpdatedAt
    author {
      entityId
      properties
    }
    parent {
      entityId
    }
  }
`;

export const getPersistedPageComments = gql`
  query getPersistedPageComments($ownedById: ID!, $pageId: ID!) {
    persistedPageComments(ownedById: $ownedById, pageId: $pageId) {
      ...CommentFields
      replies {
        ...CommentFields
      }
    }
  }
  ${commentFieldsFragment}
`;
