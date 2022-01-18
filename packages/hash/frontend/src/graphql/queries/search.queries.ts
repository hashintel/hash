import { gql } from "@apollo/client";

export const searchPages = gql`
  query searchPages($accountId: ID!, $query: String!) {
    searchPages(accountId: $accountId, query: $query) {
      page {
        entityId
        entityVersionId
        accountId
      }
      block {
        entityId
        entityVersionId
        accountId
      }
      text {
        entityId
        entityVersionId
        accountId
      }
      content
      score
    }
  }
`;
