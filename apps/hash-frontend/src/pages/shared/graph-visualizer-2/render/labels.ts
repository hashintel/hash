/**
 * Cluster and highway edge labels, faded by on-screen size so they don't
 * pop in/out at low zoom.
 *
 * PERF TODO: Use the collision extension to automatically cull overlapping labels.
 */
import { TextLayer } from "@deck.gl/layers";

import { graphColors } from "../visual-style";

import type {
  PositionsFrame,
  RenderCluster,
  RenderEdgeLabel,
  StructureFrame,
} from "../frames";
import type { Layer } from "@deck.gl/core";

/** A cluster needs this much screen presence before its circle-contained label can breathe. */
const CLUSTER_LABEL_MIN_SCREEN_RADIUS = 34;
/** A highway needs enough screen length for its lane-sized count capsule to avoid visual noise. */
const EDGE_LABEL_MIN_SCREEN_CHORD = 82;
const LABEL_FADE_PX = 18;
/** Line-to-line spacing for multi-line cluster labels (also passed to the TextLayer). */
const LABEL_LINE_HEIGHT = 1.08;

function fadeAlpha(
  screenMetric: number,
  threshold: number,
  maxAlpha: number,
): number {
  const progress = Math.min(
    1,
    Math.max(0, (screenMetric - threshold + LABEL_FADE_PX) / LABEL_FADE_PX),
  );
  return Math.round(maxAlpha * progress);
}

function clusterLabelSize(cluster: RenderCluster): number {
  // Property labels arrive multi-line ("Title = value" per line + a "(count)" line); width
  // is set by the LONGEST line and the stack must fit the bubble vertically. A single-line
  // type-set label (lineCount 1) keeps its original size via the per-line cap.
  const lines = cluster.label.split("\n");
  let longest = 1;
  for (const line of lines) {
    longest = Math.max(longest, line.length);
  }
  const widthBudget =
    cluster.depth > 0 ? cluster.radius * 0.9 : cluster.radius * 1.45;
  const perLineCap =
    cluster.depth > 0 ? cluster.radius * 0.22 : cluster.radius * 0.34;
  const stackBudget =
    cluster.depth > 0 ? cluster.radius * 0.62 : cluster.radius * 0.78;
  const widthFit = widthBudget / (longest * 0.58);
  const heightFit = Math.min(
    perLineCap,
    stackBudget / (lines.length * LABEL_LINE_HEIGHT),
  );
  return Math.min(widthFit, heightFit);
}

export function clusterLabelLayer(
  structure: StructureFrame,
  positions: PositionsFrame,
  zoom: number,
): Layer | undefined {
  const scale = 2 ** zoom;
  const data: { cluster: RenderCluster; x: number; y: number }[] = [];
  for (let index = 0; index < structure.clusters.length; index++) {
    const cluster = structure.clusters[index]!;
    data.push({
      cluster,
      x: positions.clusterPositions[index * 2] ?? 0,
      y: positions.clusterPositions[index * 2 + 1] ?? 0,
    });
  }

  return new TextLayer<{ cluster: RenderCluster; x: number; y: number }>({
    id: "cluster-labels",
    data,
    getPosition: (datum) => [
      datum.x,
      datum.cluster.depth > 0 ? datum.y - datum.cluster.radius * 0.82 : datum.y,
    ],
    getText: (datum) => datum.cluster.label,
    getSize: (datum) => clusterLabelSize(datum.cluster),
    sizeUnits: "common",
    lineHeight: LABEL_LINE_HEIGHT,
    getColor: (datum) => [
      255,
      255,
      255,
      fadeAlpha(
        datum.cluster.radius * scale,
        CLUSTER_LABEL_MIN_SCREEN_RADIUS,
        datum.cluster.depth > 0 ? 210 : 255,
      ),
    ],
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",
    fontFamily: "Inter, sans-serif",
    characterSet: "auto",
    pickable: false,
    updateTriggers: {
      getColor: zoom,
    },
  });
}

export function edgeLabelLayer(
  positions: PositionsFrame,
  zoom: number,
  positionVersion: number,
): Layer | undefined {
  if (positions.edgeLabels.length === 0) {
    return undefined;
  }
  const scale = 2 ** zoom;
  const data = positions.edgeLabels;

  if (data.length === 0) {
    return undefined;
  }
  return new TextLayer<RenderEdgeLabel>({
    id: "edge-labels",
    data,
    getPosition: (label) => [label.x, label.y],
    getText: (label) => label.text,
    getSize: (label) => label.size,
    getAngle: (label) => label.angle,
    sizeUnits: "common",
    getColor: (label) => [
      graphColors.edgeLabelText[0],
      graphColors.edgeLabelText[1],
      graphColors.edgeLabelText[2],
      fadeAlpha(label.chord * scale, EDGE_LABEL_MIN_SCREEN_CHORD, 255),
    ],
    background: true,
    getBackgroundColor: (label) => [
      graphColors.edgeLabelBackground[0],
      graphColors.edgeLabelBackground[1],
      graphColors.edgeLabelBackground[2],
      fadeAlpha(
        label.chord * scale,
        EDGE_LABEL_MIN_SCREEN_CHORD,
        graphColors.edgeLabelBackground[3],
      ),
    ],
    backgroundPadding: [6, 3, 6, 3],
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",
    fontFamily: "Inter, sans-serif",
    fontWeight: 600,
    characterSet: "auto",
    pickable: false,
    updateTriggers: {
      getColor: zoom,
      getBackgroundColor: zoom,
      getSize: positionVersion,
      getAngle: positionVersion,
    },
  });
}
