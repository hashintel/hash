import { gql } from "apollo-server-express";

/** @todo - docs */

export const subgraphTypedef = gql`
  scalar GraphElementVertexId
  scalar VersionedUri
  scalar Vertices
  scalar Edges

  # TODO: Replace with \`EdgeResolveDepths\`
  #   see https://app.asana.com/0/1201095311341924/1203399511264512/f
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

  # TODO: Maybe we want an exploration strategy instead of this? So you have parameters for a depth first search vs parameters for a breadth first, etc.
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
    vertices: Vertices!
    edges: Edges!
    depths: ResolveDepths!
  }
`;
