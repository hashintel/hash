import gql from "graphql-tag";

export const getAccountEntityTypes = gql`
  query getAccountEntityTypes($accountId: ID!) {
    getAccountEntityTypes(accountId: $accountId, includeOtherTypesInUse: true) {
      entityId
      properties
    }
  }
`;
