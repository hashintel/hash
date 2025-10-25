import { gql } from "graphql-tag";

/** @todo - docs */

export const subgraphTypedef = gql`
  scalar GraphElementVertexId
  scalar VersionedUrl
  scalar Vertices
  scalar Edges
  scalar SubgraphTemporalAxes

  type GqlSubgraph {
    roots: [GraphElementVertexId!]!
    vertices: Vertices!
    edges: Edges!
    temporalAxes: SubgraphTemporalAxes!
  }
`;
