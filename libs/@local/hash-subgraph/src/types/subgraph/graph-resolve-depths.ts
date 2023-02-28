import {
  type EdgeResolveDepths as EdgeResolveDepthsBp,
  type GraphResolveDepths as GraphResolveDepthsBp,
} from "@blockprotocol/graph/temporal";
import { Subtype } from "@local/advanced-types/subtype";

export type OutgoingEdgeResolveDepth = {
  outgoing: number;
};

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
