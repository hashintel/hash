import { GraphElementIdentifiers } from "../element-mappings.js";
import {
  KnowledgeGraphEdgeKind,
  OntologyEdgeKind,
  SharedEdgeKind,
} from "./kind.js";

/**
 * A "partial" definition of an edge which is complete when joined with the missing left-endpoint (usually the source
 * of the edge)
 */
export type GenericOutwardEdge<
  EdgeKind extends KnowledgeGraphEdgeKind | OntologyEdgeKind | SharedEdgeKind =
    | KnowledgeGraphEdgeKind
    | OntologyEdgeKind
    | SharedEdgeKind,
  Reversed extends boolean = boolean,
  Endpoint extends
    GraphElementIdentifiers<boolean>["identifier"] = GraphElementIdentifiers<boolean>["identifier"],
> = {
  kind: EdgeKind;
  reversed: Reversed;
  rightEndpoint: Endpoint;
};
