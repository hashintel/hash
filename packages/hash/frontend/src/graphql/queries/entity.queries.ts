import { gql } from "@apollo/client";
import { entityFieldsFragment } from "@hashintel/hash-shared/queries/entity.queries";

export const getEntities = gql`
  query getEntities($accountId: ID!, $filter: EntityFilter) {
    entities(accountId: $accountId, filter: $filter) {
      ...EntityFields
    }
  }
  ${entityFieldsFragment}
`;
