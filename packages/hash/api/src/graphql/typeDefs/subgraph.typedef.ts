import { gql } from "apollo-server-express";

/** @todo - docs */

export const subgraphTypedef = gql`
  scalar Vertices
  scalar Edges

  # TODO: Maybe we want an exploration strategy instead of this? So you have parameters for a depth first search vs parameters for a breadth first, etc.
  type ResolveDepths {
    dataTypeResolveDepth(depth: Int): Int!
    propertyTypeResolveDepth(depth: Int): Int!
    entityTypeResolveDepth(depth: Int): Int!
    linkTypeResolveDepth(depth: Int): Int!
    entityResolveDepth(depth: Int): Int!
    linkResolveDepth(depth: Int): Int!
  }

  type Subgraph {
    roots: [String]!
    vertices: Vertices!
    edges: Edges!
    depths: ResolveDepths!
  }
`;
