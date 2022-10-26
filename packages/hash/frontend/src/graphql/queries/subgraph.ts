import { gql } from "@apollo/client";

export const subgraphFieldsFragment = gql`
  fragment SubgraphFields on Subgraph {
    roots
    vertices
    edges
    depths {
      dataTypeResolveDepth
      propertyTypeResolveDepth
      linkTypeResolveDepth
      entityTypeResolveDepth
      linkTargetEntityResolveDepth
      linkResolveDepth
    }
  }
`;
