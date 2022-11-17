/**
 * Ensures compatibility between the types that are generated from the Graph's OpenAPI spec and the native TS types
 * defined within this module.
 *
 * This allows us to directly cast `SubgraphGraphApi as Subgraph` later on, without running through a lot of logic,
 * while still benefiting from `tsc` warning us if the two types go out of sync. The methods defined within this test
 * (and its associated modules) are therefore not for use within the library generally, as the `Subgraph` type should
 * be used everywhere.
 */

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
