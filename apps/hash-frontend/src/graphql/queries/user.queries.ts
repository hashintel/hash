import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "./subgraph";

export const isShortnameTaken = gql`
  query isShortnameTaken($shortname: String!) {
    isShortnameTaken(shortname: $shortname)
  }
`;

// We follow links rightwards twice in order to get the orgs that the user is a member of, and the orgs' avatars
// This may lead to significant overfetching when the user has a lot of e.g. pages
// @todo consider fetching the org data separately (e.g. in useOrgs)
export const meQuery = gql`
  query me {
    me(
      hasLeftEntity: { incoming: 2, outgoing: 1 }
      hasRightEntity: { incoming: 1, outgoing: 2 }
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;
