import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "@local/hash-graphql-shared/queries/subgraph";

export const isShortnameTaken = gql`
  query isShortnameTaken($shortname: String!) {
    isShortnameTaken(shortname: $shortname)
  }
`;

export const meQuery = gql`
  query me {
    me(
      # fetch the user's org memberships and the orgs they link to
      # we fetch more information on the orgs as a follow-up, in the auth context
      hasLeftEntity: { incoming: 1, outgoing: 0 }
      hasRightEntity: { incoming: 0, outgoing: 1 }
    ) {
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${subgraphFieldsFragment}
`;
