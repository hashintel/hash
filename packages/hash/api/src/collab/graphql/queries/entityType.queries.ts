import gql from "graphql-tag";

export const getTextEntityType = gql`
  query getTextEntityType {
    getEntityType(choice: { systemTypeName: Text }) {
      entityId
    }
  }
`;

export const getComponentEntityType = gql`
  query getComponentEntityType($componentId: ID!) {
    getEntityType(choice: { componentId: $componentId }) {
      entityId
    }
  }
`;
