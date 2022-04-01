import { gql } from "@apollo/client";

export const getEntities = gql`
  query getEntities($accountId: ID!, $filter: EntityFilter) {
    entities(accountId: $accountId, filter: $filter) {
      entityId
      accountId
      entityTypeId
      entityTypeName
      properties
    }
  }
`;
