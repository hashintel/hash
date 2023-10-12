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

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    archived
    title
    icon
    summary
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

export const getPageQuery = gql`
  query getPage($entityId: EntityId!) {
    page(entityId: $entityId) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;
