import { gql } from "apollo-server-express";

/** @todo - docs */

export const subgraphTypedef = gql`
  scalar GraphElementVertexId
  scalar VersionedUrl
  scalar SerializedVertices
  scalar Edges
  scalar SubgraphTemporalAxes

  # @todo Replace with \`EdgeResolveDepths\`
  # @see https://linear.app/hash/issue/H-3018
  type OutgoingEdgeResolveDepth {
    outgoing: Int!
  }
  input OutgoingEdgeResolveDepthInput {
    outgoing: Int!
  }

  type EdgeResolveDepths {
    incoming: Int!
    outgoing: Int!
  }
  input EdgeResolveDepthsInput {
    incoming: Int!
    outgoing: Int!
  }

  # @todo: Maybe we want an exploration strategy instead of this? So you have parameters for a depth first search vs parameters for a breadth first, etc.
  type ResolveDepths {
    inheritsFrom: OutgoingEdgeResolveDepth!
    constrainsValuesOn: OutgoingEdgeResolveDepth!
    constrainsPropertiesOn: OutgoingEdgeResolveDepth!
    constrainsLinksOn: OutgoingEdgeResolveDepth!
    constrainsLinkDestinationsOn: OutgoingEdgeResolveDepth!
    isOfType: OutgoingEdgeResolveDepth!
    hasLeftEntity: EdgeResolveDepths!
    hasRightEntity: EdgeResolveDepths!
  }

  type Subgraph {
    roots: [GraphElementVertexId!]!
    vertices: SerializedVertices!
    edges: Edges!
    depths: ResolveDepths!
    temporalAxes: SubgraphTemporalAxes!
  }
`;
