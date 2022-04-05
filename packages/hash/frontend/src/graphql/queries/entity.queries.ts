import { gql } from "@apollo/client";

const entityFieldsFragment = gql`
  fragment EntityFields on Entity {
    accountId
    entityId
    entityTypeId
    entityTypeName
    entityTypeVersionId
    ... on UnknownEntity {
      properties
    }
  }
`;

export const getEntities = gql`
  query getEntities($accountId: ID!, $filter: EntityFilter) {
    entities(accountId: $accountId, filter: $filter) {
      ...EntityFields
    }
  }
  ${entityFieldsFragment}
`;
