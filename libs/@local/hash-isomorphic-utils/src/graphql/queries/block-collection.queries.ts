import { gql } from "@apollo/client";

const blockFieldsFragment = gql`
  fragment BlockFields on Block {
    __typename
    metadata
    properties
    blockChildEntity
    componentId
  }
`;

const blockCollectionFieldsFragment = gql`
  fragment BlockCollectionFields on BlockCollection {
    contents {
      rightEntity {
        ...BlockFields
      }
      linkEntity
    }
    metadata
    properties
    __typename
  }
  ${blockFieldsFragment}
`;

export const updateBlockCollectionContents = gql`
  mutation updateBlockCollectionContents(
    $entityId: EntityId!
    $actions: [UpdateBlockCollectionAction!]!
  ) {
    updateBlockCollectionContents(entityId: $entityId, actions: $actions) {
      blockCollection {
        ...BlockCollectionFields
      }
      placeholders {
        placeholderId
        entityId
      }
    }
  }

  ${blockCollectionFieldsFragment}
`;
