import type {
  EdgeResolveDepths as EdgeResolveDepthsBp,
  GraphResolveDepths as GraphResolveDepthsBp,
} from "@blockprotocol/graph";
import type { Subtype } from "@local/advanced-types/subtype";

export interface OutgoingEdgeResolveDepth {
  outgoing: number;
}

export type EdgeResolveDepths = EdgeResolveDepthsBp;

export type GraphResolveDepths = Subtype<
  GraphResolveDepthsBp,
  {
    constrainsLinkDestinationsOn: OutgoingEdgeResolveDepth;
    constrainsLinksOn: OutgoingEdgeResolveDepth;
    constrainsPropertiesOn: OutgoingEdgeResolveDepth;
    constrainsValuesOn: OutgoingEdgeResolveDepth;
    hasLeftEntity: EdgeResolveDepths;
    hasRightEntity: EdgeResolveDepths;
    inheritsFrom: OutgoingEdgeResolveDepth;
    isOfType: OutgoingEdgeResolveDepth;
  }
>;
