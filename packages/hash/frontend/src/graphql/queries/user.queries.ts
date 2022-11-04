import { gql } from "@apollo/client";
import { subgraphFieldsFragment } from "./subgraph";

export const isShortnameTaken = gql`
  query isShortnameTaken($shortname: String!) {
    isShortnameTaken(shortname: $shortname)
  }
`;

export const meQuery = gql`
  query me {
    me(linkResolveDepth: 2, linkTargetEntityResolveDepth: 2) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment}
`;
