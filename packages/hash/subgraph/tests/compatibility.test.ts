import { Subgraph as SubgraphGraphApi } from "@hashintel/hash-graph-client";
import { Subgraph } from "../src";
import { mapVertices } from "./compatibility.test/map-vertices";
import { mapEdges } from "./compatibility.test/map-edges";

test("Graph API subgraph type is compatible with library type", () => {
  // We don't need an actual subgraph, we are just checking for TSC errors
  const subgraphGraphApi: SubgraphGraphApi = {
    roots: [],
    vertices: {},
    edges: {},
    depths: {
      dataTypeResolveDepth: 0,
      propertyTypeResolveDepth: 0,
      entityTypeResolveDepth: 0,
      entityResolveDepth: 0,
    },
  };

  // We just want to check for errors in the type when building the object, no need to use the return value
  const _subgraph: Subgraph = {
    roots: subgraphGraphApi.roots,
    vertices: mapVertices(subgraphGraphApi.vertices),
    edges: mapEdges(subgraphGraphApi.edges),
    depths: subgraphGraphApi.depths,
  };
});
