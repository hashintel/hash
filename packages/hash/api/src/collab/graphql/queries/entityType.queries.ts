import gql from "graphql-tag";

export const getAccountEntityTypes = gql`
  query getAccountEntityTypes($accountId: ID!) {
    getAccountEntityTypes(accountId: $accountId, includeOtherTypesInUse: true) {
      entityId
      properties
    }
  }
`;

export const getTextEntityType = gql`
  query getTextEntityType {
    getEntityType(choice: { systemTypeName: Text }) {
      entityId
    }
  }
`;
