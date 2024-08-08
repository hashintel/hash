/**
 * Ensures compatibility between the types that are generated from the Graph's OpenAPI spec and the native TS types
 * defined within this module.
 *
 * This allows us to directly cast `SubgraphGraphApi as Subgraph` later on, without running through a lot of logic,
 * while still benefiting from `tsc` warning us if the two types go out of sync. The methods defined within this test
 * (and its associated modules) are therefore not for use within the library generally, as the `Subgraph` type should
 * be used everywhere.
 */

import type { Subgraph as SubgraphGraphApi } from "@local/hash-graph-client";
import { test } from "vitest";

import type { Subgraph } from "../src/main.js";
import {
  mapQueryTemporalAxes,
  mapQueryTemporalAxesUnresolved,
} from "./compatibility.test/map-axes.js";
import { mapEdges } from "./compatibility.test/map-edges.js";
import { mapRoots } from "./compatibility.test/map-roots.js";
import { mapVertices } from "./compatibility.test/map-vertices.js";

test("Graph API subgraph type is compatible with library type", () => {
  // We don't need an actual subgraph, we are just checking for TSC errors
  const subgraphGraphApi: SubgraphGraphApi = {
    roots: [],
    vertices: {},
    edges: {},
    depths: {
      inheritsFrom: {
        outgoing: 0,
      },
      constrainsValuesOn: {
        outgoing: 0,
      },
      constrainsPropertiesOn: {
        outgoing: 0,
      },
      constrainsLinksOn: {
        outgoing: 0,
      },
      constrainsLinkDestinationsOn: {
        outgoing: 0,
      },
      isOfType: {
        outgoing: 0,
      },
      hasLeftEntity: {
        incoming: 0,
        outgoing: 0,
      },
      hasRightEntity: {
        incoming: 0,
        outgoing: 0,
      },
    },
    temporalAxes: {
      initial: {
        pinned: {
          axis: "transactionTime",
          timestamp: null,
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: {
              kind: "unbounded",
            },
            end: null,
          },
        },
      },
      resolved: {
        pinned: {
          axis: "transactionTime",
          timestamp: "2022-01-01T0:0:0",
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: {
              kind: "unbounded",
            },
            end: {
              kind: "inclusive",
              limit: "2022-01-01T0:0:0",
            },
          },
        },
      },
    },
  };

  // We just want to check for errors in the type when building the object, no need to use the return value
  const _subgraph: Subgraph = {
    roots: mapRoots(subgraphGraphApi.roots),
    vertices: mapVertices(subgraphGraphApi.vertices),
    edges: mapEdges(subgraphGraphApi.edges),
    depths: subgraphGraphApi.depths,
    temporalAxes: {
      initial: mapQueryTemporalAxesUnresolved(
        subgraphGraphApi.temporalAxes.initial,
      ),
      resolved: mapQueryTemporalAxes(subgraphGraphApi.temporalAxes.resolved),
    },
  };
});
