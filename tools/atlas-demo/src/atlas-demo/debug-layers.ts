/** Color-and-text debug framing for the visible scheduler working set. */

import { COORDINATE_SYSTEM, type Color, type Layer } from "@deck.gl/core";
import { LineLayer, TextLayer } from "@deck.gl/layers";

import { atlasTileBounds, atlasTileKey } from "../atlas-client";

import type { AtlasDebugTile, AtlasDebugTileState } from "../atlas-frontier";

type Position = [number, number, number];

interface DebugSegment {
  readonly color: Color;
  readonly source: Position;
  readonly target: Position;
  readonly width: number;
}

interface DebugLabel {
  readonly color: Color;
  readonly position: Position;
  readonly text: string;
}

const stateColor: Record<AtlasDebugTileState, Color> = {
  active: [91, 206, 230, 230],
  cached: [103, 138, 166, 150],
  error: [245, 105, 84, 245],
  loading: [242, 190, 73, 240],
  queued: [172, 177, 181, 180],
};

const stateMark: Record<AtlasDebugTileState, string> = {
  active: "A",
  cached: "C",
  error: "E",
  loading: "L",
  queued: "Q",
};

const visibleDebugTile = ({ state }: AtlasDebugTile): boolean =>
  state !== "cached";

/** Creates deck.gl line and text layers for scheduler diagnostics. */
export const createAtlasDebugLayers = (
  debugTiles: readonly AtlasDebugTile[],
): readonly Layer[] => {
  const visibleTiles = debugTiles.filter(visibleDebugTile);
  const segments: DebugSegment[] = [];
  const labels: DebugLabel[] = [];

  for (const debugTile of visibleTiles) {
    const { coordinate, state } = debugTile;
    const bounds = atlasTileBounds(coordinate);
    const color = stateColor[state];
    const minimum: Position = [bounds.minimumX, bounds.minimumY, 0];
    const maximum: Position = [bounds.maximumX, bounds.maximumY, 0];
    segments.push(
      {
        color,
        source: minimum,
        target: [bounds.maximumX, bounds.minimumY, 0],
        width: state === "active" ? 1.75 : 1,
      },
      {
        color,
        source: [bounds.maximumX, bounds.minimumY, 0],
        target: maximum,
        width: state === "active" ? 1.75 : 1,
      },
      {
        color,
        source: maximum,
        target: [bounds.minimumX, bounds.maximumY, 0],
        width: state === "active" ? 1.75 : 1,
      },
      {
        color,
        source: [bounds.minimumX, bounds.maximumY, 0],
        target: minimum,
        width: state === "active" ? 1.75 : 1,
      },
    );

    const inset = Math.max((bounds.maximumX - bounds.minimumX) * 0.035, 2);
    labels.push({
      color,
      position: [bounds.minimumX + inset, bounds.maximumY - inset, 0],
      text: `${stateMark[state]} ${atlasTileKey(coordinate)}`,
    });
  }

  return [
    new LineLayer<DebugSegment>({
      id: "atlas-debug-frames",
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: segments,
      getColor: (segment) => segment.color,
      getSourcePosition: (segment) => segment.source,
      getTargetPosition: (segment) => segment.target,
      getWidth: (segment) => segment.width,
      pickable: false,
      widthMinPixels: 1,
      widthUnits: "pixels",
    }),
    new TextLayer<DebugLabel>({
      id: "atlas-debug-labels",
      background: true,
      backgroundPadding: [3, 2],
      billboard: true,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      data: labels,
      fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
      fontSettings: { sdf: true },
      getBackgroundColor: [15, 25, 29, 215],
      getColor: (label) => label.color,
      getPosition: (label) => label.position,
      getSize: 11,
      getText: (label) => label.text,
      getTextAnchor: "start",
      getAlignmentBaseline: "top",
      pickable: false,
      sizeUnits: "pixels",
    }),
  ];
};
