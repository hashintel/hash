import { gql } from "apollo-server-express";

/** @todo - docs */

export const subgraphTypedef = gql`
  scalar Vertices
  scalar Edges

  # TODO: Maybe we want an exploration strategy instead of this? So you have parameters for a depth first search vs parameters for a breadth first, etc.
  type ResolveDepths {
    dataTypeResolveDepth: Int!
    propertyTypeResolveDepth: Int!
    entityTypeResolveDepth: Int!
    entityResolveDepth: Int!
  }

  type Subgraph {
    roots: [String!]!
    vertices: Vertices!
    edges: Edges!
    depths: ResolveDepths!
  }
`;
