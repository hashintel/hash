import { LineLayer } from "@deck.gl/layers";
// eslint-disable-next-line import/no-extraneous-dependencies -- vitest is provided by the monorepo; the frontend's own test runner is not yet wired up.
import { describe, expect, it } from "vitest";

import { BEZIER_NO_LINK } from "../frames";
import { edgeLayer } from "./edges";
import { BezierSDFLayer } from "./gpu/bezier-sdf-layer";

import type { PositionsFrame, RenderBezierBuffers } from "../frames";

function beziers(): RenderBezierBuffers {
  return {
    positions: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0]),
    colors: new Uint8Array([180, 80, 80, 200]),
    widths: new Float32Array([1.2]),
    clips: new Float32Array(6),
    ids: new Uint32Array([BEZIER_NO_LINK]),
    segmentCount: 1,
  };
}

function positionsFrame(): PositionsFrame {
  return {
    version: 1,
    settled: true,
    clusterPositions: new Float32Array(),
    beziers: beziers(),
    edgeLabels: [],
    edgeArrows: [],
    entityFanOut: [],
  };
}

describe("edgeLayer", () => {
  it("uses a distinct LineLayer id for flat edges", () => {
    const layers = edgeLayer(positionsFrame(), true);

    expect(layers).toHaveLength(1);
    expect(layers[0]?.id).toBe("flat-edges");
    expect(layers[0]).toBeInstanceOf(LineLayer);
  });

  it("uses distinct Bezier layer ids for hierarchical edges", () => {
    const layers = edgeLayer(positionsFrame(), false);

    expect(layers.map((layer) => layer.id)).toEqual([
      "edges-underlay",
      "hierarchical-edges",
    ]);
    expect(layers[0]).toBeInstanceOf(BezierSDFLayer);
    expect(layers[1]).toBeInstanceOf(BezierSDFLayer);
  });
});
