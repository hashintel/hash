import {
  GraphElementEditionId,
  GraphResolveDepths,
} from "@hashintel/hash-graph-client";
import { GraphElement } from "./element";
import { Vertices } from "./vertex";
import { Edges } from "./edge";

export type Subgraph<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RootType extends GraphElement = GraphElement,
> = {
  roots: GraphElementEditionId[];
  vertices: Vertices;
  edges: Edges;
  depths: GraphResolveDepths;
};
