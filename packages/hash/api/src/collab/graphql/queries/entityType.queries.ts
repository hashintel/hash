import gql from "graphql-tag";

export const deprecatedGetTextEntityType = gql`
  query deprecatedGetTextEntityType {
    deprecatedGetEntityType(choice: { systemTypeName: Text }) {
      entityId
    }
  }
`;

export const deprecatedGetComponentEntityType = gql`
  query deprecatedGetComponentEntityType($componentId: ID!) {
    deprecatedGetEntityType(choice: { componentId: $componentId }) {
      entityId
    }
  }
`;
