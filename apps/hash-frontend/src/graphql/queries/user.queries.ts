import { gql } from "@apollo/client";

import { subgraphFieldsFragment } from "./subgraph";

export const isShortnameTaken = gql`
  query isShortnameTaken($shortname: String!) {
    isShortnameTaken(shortname: $shortname)
  }
`;

export const meQuery = gql`
  query me {
    me(
      hasLeftEntity: { incoming: 1, outgoing: 1 }
      hasRightEntity: { incoming: 1, outgoing: 1 }
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;
