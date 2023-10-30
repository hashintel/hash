import { gql } from "@apollo/client";

import { commentFieldsFragment } from "./comment.queries";

export const setParentPage = gql`
  mutation setParentPage(
    $pageEntityId: EntityId!
    $parentPageEntityId: EntityId
    $prevFractionalIndex: String
    $nextIndex: String
  ) {
    setParentPage(
      pageEntityId: $pageEntityId
      parentPageEntityId: $parentPageEntityId
      prevFractionalIndex: $prevFractionalIndex
      nextIndex: $nextIndex
    ) {
      metadata
      title
      summary
      __typename
    }
  }
`;

export const createPage = gql`
  mutation createPage($ownedById: OwnedById!, $properties: PageCreationData!) {
    createPage(ownedById: $ownedById, properties: $properties) {
      metadata
    }
  }
`;

export const updatePage = gql`
  mutation updatePage(
    $entityId: EntityId!
    $updatedProperties: PageUpdateData!
  ) {
    updatePage(entityId: $entityId, updatedProperties: $updatedProperties) {
      metadata
    }
  }
`;

export const getPageComments = gql`
  query getPageComments($entityId: EntityId!) {
    pageComments(entityId: $entityId) {
      ...CommentFields
      replies {
        ...CommentFields
      }
    }
  }
  ${commentFieldsFragment}
`;
