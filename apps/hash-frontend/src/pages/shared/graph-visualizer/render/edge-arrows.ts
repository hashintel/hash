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
  // `positions.edgeArrows` is a fresh array every frame (the worker transfers it), so there is
  // nothing stable to cache by; the partition is a couple of cheap pushes over a bounded list.
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
  if (positions.edgeArrows.length === 0) {
    return [];
  }

  const scale = 2 ** zoom;
  const { lanes, endpoints } = splitEdgeArrows(positions.edgeArrows);
  return [
    ...(endpoints.length > 0
      ? [
          new EndpointVLayer({
            id: "edge-endpoint-arrows",
            data: endpoints,
            getSize: (arrow) => arrow.size,
            getColor: (arrow) => [
              arrow.color[0],
              arrow.color[1],
              arrow.color[2],
              fadeAlpha(
                arrow.chord * scale,
                EDGE_ARROW_MIN_SCREEN_CHORD,
                Math.min(255, Math.round(arrow.color[3] * 1.28)),
              ),
            ],
            pickable: false,
            parameters: { depthWriteEnabled: false, depthCompare: "always" },
          }),
        ]
      : []),
    ...(lanes.length > 0
      ? [
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
        ]
      : []),
  ];
}
