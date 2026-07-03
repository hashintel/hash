import { TextLayer } from "@deck.gl/layers";

import { EndpointVLayer } from "./gpu/endpoint-v-layer";

import type { PositionsFrame, RenderEdgeArrow } from "../frames";
import type { Layer } from "@deck.gl/core";

const EDGE_ARROW_MIN_SCREEN_CHORD = 36;
const EDGE_ARROW_FADE_PX = 14;
const EDGE_ARROW_TEXT = "›";

interface EdgeArrowSplit {
  readonly lanes: RenderEdgeArrow[];
  readonly endpoints: RenderEdgeArrow[];
}

function fadeAlpha(screenMetric: number, threshold: number, alpha: number) {
  const progress = Math.min(
    1,
    Math.max(
      0,
      (screenMetric - threshold + EDGE_ARROW_FADE_PX) / EDGE_ARROW_FADE_PX,
    ),
  );
  return Math.round(alpha * progress);
}

function arrowAngleDegrees(arrow: RenderEdgeArrow): number {
  // TextLayer angles are screen-space degrees; the graph's y axis is projected through
  // OrthographicView, so mirror the worker's world-space radians as labels do.
  return (-arrow.angle * 180) / Math.PI;
}

function splitEdgeArrows(arrows: readonly RenderEdgeArrow[]): EdgeArrowSplit {
  // edgeArrows is a new array each frame, so partition in place (cheap for
  // bounded length).
  const lanes: RenderEdgeArrow[] = [];
  const endpoints: RenderEdgeArrow[] = [];
  for (const arrow of arrows) {
    if (arrow.kind === "lane") {
      lanes.push(arrow);
    } else {
      endpoints.push(arrow);
    }
  }
  return { lanes, endpoints };
}

export function edgeArrowLayer(
  positions: PositionsFrame,
  zoom: number,
): Layer[] {
  const scale = 2 ** zoom;
  const layers: Layer[] = [];

  // Flat tier: packed per-edge arrows straight to the GPU as binary
  // attributes; chord fade runs in the shader against deck's project module
  // (world→pixel via the live viewport), so 22k+ arrows cost zero per-frame
  // CPU here.
  const { flatArrows } = positions;
  if (flatArrows && flatArrows.count > 0) {
    layers.push(
      new EndpointVLayer({
        id: "edge-endpoint-arrows",
        data: {
          length: flatArrows.count,
          attributes: {
            getPosition: { value: flatArrows.positions, size: 2 },
            getAngle: { value: flatArrows.angles, size: 1 },
            getSize: { value: flatArrows.sizes, size: 1 },
            getChord: { value: flatArrows.chords, size: 1 },
            getColor: { value: flatArrows.colors, size: 4 },
          },
        },
        pickable: false,
        parameters: { depthWriteEnabled: false, depthCompare: "always" },
      }),
    );
  }

  if (positions.edgeArrows.length === 0) {
    return layers;
  }

  // Hierarchical tier: bounded object arrows (a few hundred lane marks).
  const { lanes, endpoints } = splitEdgeArrows(positions.edgeArrows);
  if (endpoints.length > 0) {
    layers.push(
      new EndpointVLayer({
        id: "edge-endpoint-arrows",
        data: endpoints,
        getSize: (arrow) => arrow.size,
        getColor: (arrow) => arrow.color,
        pickable: false,
        parameters: { depthWriteEnabled: false, depthCompare: "always" },
      }),
    );
  }

  if (lanes.length > 0) {
    layers.push(
      new TextLayer<RenderEdgeArrow>({
        id: "edge-lane-chevrons",
        data: lanes,
        getPosition: (arrow) => [arrow.x, arrow.y],
        getText: () => EDGE_ARROW_TEXT,
        getSize: (arrow) => arrow.size,
        sizeUnits: "common",
        getAngle: arrowAngleDegrees,
        getColor: (arrow) => [
          255,
          255,
          255,
          fadeAlpha(arrow.chord * scale, EDGE_ARROW_MIN_SCREEN_CHORD, 230),
        ],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Inter, sans-serif",
        fontWeight: 700,
        characterSet: [EDGE_ARROW_TEXT],
        pickable: false,
        parameters: { depthWriteEnabled: false, depthCompare: "always" },
      }),
    );
  }
  return layers;
}
