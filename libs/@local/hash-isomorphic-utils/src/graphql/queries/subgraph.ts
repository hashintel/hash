import { gql } from "@apollo/client";

export const subgraphFieldsFragment = gql`
  fragment SubgraphFields on GqlSubgraph {
    roots
    vertices
    edges
    temporalAxes
  }
`;
