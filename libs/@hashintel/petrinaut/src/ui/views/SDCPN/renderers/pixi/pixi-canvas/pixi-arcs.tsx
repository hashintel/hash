/**
 * Arcs as one Pixi mesh: every arc's ribbon and arrow head in a shared
 * geometry with per-vertex colour and width, so a firing pulse rewrites a
 * few floats instead of re-tessellating a stroke. Selection halos, read and
 * inhibitor markers and weight labels are few and drawn with Graphics.
 */

import {
  Buffer as PixiBuffer,
  BufferUsage,
  Container,
  Geometry,
  Graphics,
  Mesh,
  Shader,
} from "pixi.js";
import { useLayoutEffect, useRef, type FC } from "react";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import { pointAlong, polylineLength, type ArcPolyline } from "./arc-paths";
import { pixiLabelBoldFont, pixiLabelFont } from "./pixi-fonts";
import {
  arcSelectionHalo,
  colorChannels,
  dimmedAlpha,
  weightLabelBorder,
  weightSymbolColor,
  weightTextColor,
  type PixiTheme,
} from "./pixi-theme";

import type {
  CanvasArc,
  CanvasPoint,
  CanvasScene,
} from "../../../canvas-scene";
import type { ArcPolylines } from "./arc-polylines";

export const baseStrokeWidth = 2;

/** Vertices per arc: the ribbon can hold this many polyline points. */
const maxPolylinePoints = 64;
const ribbonVertices = maxPolylinePoints * 2;
const arrowVertices = 3;
const arcVertices = ribbonVertices + arrowVertices;
const arcIndices = (maxPolylinePoints - 1) * 6 + 3;

const arrowLength = 12;
const arrowHalfWidth = 5;
const readMarkerRadius = 4;
const inhibitorMarkerRadius = 10;
const inhibitorTickSpacing = 13;
const inhibitorTickHalfLength = 5;
/** Read arcs draw dashed "2 6": two units on, six off. */
const readDashOn = 2;
const readDashPeriod = 8;

// Buffer usage flags are powers of two, so adding them combines them.
const dynamicVertexUsage = BufferUsage.VERTEX + BufferUsage.COPY_DST;
const dynamicIndexUsage = BufferUsage.INDEX + BufferUsage.COPY_DST;

// Each ribbon vertex carries its centreline point, a unit normal, a width,
// its distance along the arc, a dash flag and a colour. The shader offsets
// the point by half the width along the normal.
const arcVertexShader = /* glsl */ `
  in vec2 aPosition;
  in vec2 aNormal;
  in float aWidth;
  in float aDistance;
  in float aDash;
  in vec4 aColor;
  out float vDistance;
  out float vDash;
  out vec4 vColor;
  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;
  uniform mat3 uTransformMatrix;
  void main() {
    vec2 position = aPosition + aNormal * (aWidth * 0.5);
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(position, 1.0)).xy, 0.0, 1.0);
    vDistance = aDistance;
    vDash = aDash;
    vColor = aColor;
  }
`;

const arcFragmentShader = /* glsl */ `
  in float vDistance;
  in float vDash;
  in vec4 vColor;
  out vec4 finalColor;
  void main() {
    if (vDash > 0.5 && mod(vDistance, ${readDashPeriod.toFixed(1)}) > ${readDashOn.toFixed(1)}) discard;
    finalColor = vec4(vColor.rgb * vColor.a, vColor.a);
  }
`;

export type ArcBatch = {
  arcs: CanvasArc[];
  indexOf: Map<string, number>;
  mesh: Mesh<Geometry, Shader>;
  positions: Float32Array;
  normals: Float32Array;
  widths: Float32Array;
  distances: Float32Array;
  dashes: Float32Array;
  colors: Float32Array;
  buffers: Record<
    "position" | "normal" | "width" | "distance" | "dash" | "color",
    PixiBuffer
  >;
};

const vertexBuffer = (data: Float32Array) =>
  new PixiBuffer({ data, usage: dynamicVertexUsage });

// Pixi uploads one byte range per update and remembers the last size, so every
// upload states its range explicitly.
const uploadAll = (buffer: PixiBuffer) =>
  buffer.update(buffer.data.byteLength, 0);
const uploadArcs = (
  buffer: PixiBuffer,
  floatsPerVertex: number,
  first: number,
  count: number,
) =>
  buffer.update(
    count * arcVertices * floatsPerVertex * 4,
    first * arcVertices * floatsPerVertex * 4,
  );

const arcSpan = (
  indices: Iterable<number>,
): { first: number; count: number } => {
  let min = Infinity;
  let max = -Infinity;
  for (const index of indices) {
    min = Math.min(min, index);
    max = Math.max(max, index);
  }
  return { first: min, count: max - min + 1 };
};

const createArcBatch = (arcs: CanvasArc[]): ArcBatch => {
  const vertexCount = arcs.length * arcVertices;
  const positions = new Float32Array(vertexCount * 2);
  const normals = new Float32Array(vertexCount * 2);
  const widths = new Float32Array(vertexCount).fill(baseStrokeWidth);
  const distances = new Float32Array(vertexCount);
  const dashes = new Float32Array(vertexCount);
  const colors = new Float32Array(vertexCount * 4);
  const indices = new Uint32Array(arcs.length * arcIndices);

  arcs.forEach((_, arcIndex) => {
    const base = arcIndex * arcVertices;
    let offset = arcIndex * arcIndices;
    for (let segment = 0; segment < maxPolylinePoints - 1; segment++) {
      const left = base + segment * 2;
      indices[offset++] = left;
      indices[offset++] = left + 1;
      indices[offset++] = left + 2;
      indices[offset++] = left + 1;
      indices[offset++] = left + 3;
      indices[offset++] = left + 2;
    }
    indices[offset++] = base + ribbonVertices;
    indices[offset++] = base + ribbonVertices + 1;
    indices[offset++] = base + ribbonVertices + 2;
  });

  const buffers = {
    position: vertexBuffer(positions),
    normal: vertexBuffer(normals),
    width: vertexBuffer(widths),
    distance: vertexBuffer(distances),
    dash: vertexBuffer(dashes),
    color: vertexBuffer(colors),
  };
  const geometry = new Geometry({
    attributes: {
      aPosition: buffers.position,
      aNormal: buffers.normal,
      aWidth: buffers.width,
      aDistance: buffers.distance,
      aDash: buffers.dash,
      aColor: buffers.color,
    },
    indexBuffer: new PixiBuffer({ data: indices, usage: dynamicIndexUsage }),
  });
  const shader = Shader.from({
    gl: {
      vertex: arcVertexShader,
      fragment: arcFragmentShader,
      name: "petrinaut-arc-ribbon",
    },
  });
  const mesh = new Mesh<Geometry, Shader>({ geometry, shader });
  mesh.eventMode = "none";
  return {
    arcs,
    indexOf: new Map(arcs.map((arc, index) => [arc.id, index])),
    mesh,
    positions,
    normals,
    widths,
    distances,
    dashes,
    colors,
    buffers,
  };
};

// Destroying the mesh drops its references, so its parts are taken first.
const destroyArcBatch = (batch: ArcBatch) => {
  const { geometry, shader } = batch.mesh;
  batch.mesh.destroy();
  geometry.destroy();
  shader?.destroy();
};

/** Length of the arc the arrow head or marker takes up at the target end. */
const markerInset = (arc: CanvasArc) =>
  arc.kind === "inhibitor"
    ? inhibitorMarkerRadius * 2
    : arc.kind === "read"
      ? readMarkerRadius
      : arrowLength;

/**
 * Writes one arc's ribbon and arrow head. The polyline is resampled to the
 * fixed vertex budget and stops short of the marker at the target end. Read
 * and inhibitor markers are Graphics, so their arrow triangles collapse.
 */
const writeArc = (
  batch: ArcBatch,
  arcIndex: number,
  arc: CanvasArc,
  polyline: ArcPolyline,
  theme: PixiTheme,
) => {
  const { positions, normals, distances, dashes, colors } = batch;
  const base = arcIndex * arcVertices;
  const total = polylineLength(polyline.points);
  const usable = Math.max(0, total - markerInset(arc));
  const { color, alpha } = theme.color(arc.color);
  const [red, green, blue] = colorChannels(color).map(
    (channel) => channel / 255,
  ) as [number, number, number];
  const finalAlpha = alpha * (arc.dimmed ? dimmedAlpha : 1);
  const rgba = [red, green, blue, finalAlpha];

  for (let index = 0; index < maxPolylinePoints; index++) {
    const distance = (usable * index) / (maxPolylinePoints - 1);
    const { point, tangent } = pointAlong(polyline.points, distance);
    const normal = { x: -tangent.y, y: tangent.x };
    for (const side of [1, -1]) {
      const vertex = base + index * 2 + (side === 1 ? 0 : 1);
      positions[vertex * 2] = point.x;
      positions[vertex * 2 + 1] = point.y;
      normals[vertex * 2] = normal.x * side;
      normals[vertex * 2 + 1] = normal.y * side;
      distances[vertex] = distance;
      dashes[vertex] = arc.kind === "read" ? 1 : 0;
      colors.set(rgba, vertex * 4);
    }
  }

  const end = polyline.points[polyline.points.length - 1]!;
  const tangent = polyline.endTangent;
  const normal = { x: -tangent.y, y: tangent.x };
  const tail = {
    x: end.x - tangent.x * arrowLength,
    y: end.y - tangent.y * arrowLength,
  };
  const corners =
    arc.kind === "standard"
      ? [
          end,
          {
            x: tail.x + normal.x * arrowHalfWidth,
            y: tail.y + normal.y * arrowHalfWidth,
          },
          {
            x: tail.x - normal.x * arrowHalfWidth,
            y: tail.y - normal.y * arrowHalfWidth,
          },
        ]
      : [end, end, end];
  corners.forEach((corner, cornerIndex) => {
    const vertex = base + ribbonVertices + cornerIndex;
    positions[vertex * 2] = corner.x;
    positions[vertex * 2 + 1] = corner.y;
    normals[vertex * 2] = 0;
    normals[vertex * 2 + 1] = 0;
    dashes[vertex] = 0;
    colors.set(rgba, vertex * 4);
  });
};

/** Sets an arc's ribbon width; the animator calls this every frame for pulsing arcs. */
export const setArcWidth = (
  batch: ArcBatch,
  arcIndex: number,
  width: number,
) => {
  const base = arcIndex * arcVertices;
  batch.widths.fill(width, base, base + ribbonVertices);
};

export const uploadArcWidths = (
  batch: ArcBatch,
  arcIndexes: Iterable<number>,
) => {
  const { first, count } = arcSpan(arcIndexes);
  if (count > 0) uploadArcs(batch.buffers.width, 1, first, count);
};

const uploadArcGeometry = (batch: ArcBatch) => {
  for (const buffer of Object.values(batch.buffers)) uploadAll(buffer);
};

const arcListKey = (arcs: CanvasArc[]) => arcs.map((arc) => arc.id).join(" ");

/**
 * The ribbon mesh for every arc. The mesh is an imperative child of this
 * layer: the batch is rebuilt when arcs are added or removed and rewritten in
 * place when only geometry, colours or dimming change. `onBatchChange`
 * announces the live batch, so the animator can write widths into it.
 */
export const PixiArcMesh: FC<{
  scene: CanvasScene;
  polylines: ArcPolylines;
  theme: PixiTheme;
  onBatchChange: (batch: ArcBatch | null) => void;
}> = ({ scene, polylines, theme, onBatchChange }) => {
  const layerRef = useRef<Container>(null);
  const batchRef = useRef<ArcBatch | null>(null);
  const latestArcs = useLatest(scene.arcs);
  const notifyBatch = useLatest(onBatchChange);
  const structureKey = arcListKey(scene.arcs);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const announce = notifyBatch.current;
    const batch = createArcBatch(latestArcs.current);
    layer.addChild(batch.mesh);
    batchRef.current = batch;
    announce(batch);
    return () => {
      batchRef.current = null;
      announce(null);
      layer.removeChild(batch.mesh);
      destroyArcBatch(batch);
    };
    // The key stands for the arc list; the batch is rebuilt only when that changes.
  }, [structureKey, latestArcs, notifyBatch]);

  useLayoutEffect(() => {
    const batch = batchRef.current;
    if (!batch) return;
    batch.arcs.forEach((arc, arcIndex) => {
      const polyline = polylines.get(arc.id);
      if (polyline) writeArc(batch, arcIndex, arc, polyline, theme);
    });
    uploadArcGeometry(batch);
  }, [scene, polylines, theme]);

  return <pixiContainer ref={layerRef} eventMode="none" />;
};

// Decorations ----------------------------------------------------------------------

const drawSelectionHalos = (
  graphics: Graphics,
  scene: CanvasScene,
  polylines: ArcPolylines,
) => {
  graphics.clear();
  for (const arc of scene.arcs) {
    if (!arc.selected) continue;
    const points = polylines.get(arc.id)?.points;
    if (!points || points.length < 2) continue;
    graphics.moveTo(points[0]!.x, points[0]!.y);
    for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.stroke({
      color: arcSelectionHalo.color,
      alpha: arcSelectionHalo.alpha,
      width: arcSelectionHalo.width,
    });
  }
};

const drawMarkers = (
  graphics: Graphics,
  scene: CanvasScene,
  polylines: ArcPolylines,
  theme: PixiTheme,
) => {
  graphics.clear();
  for (const arc of scene.arcs) {
    if (arc.kind === "standard") continue;
    const polyline = polylines.get(arc.id);
    if (!polyline) continue;
    const end = polyline.points[polyline.points.length - 1]!;
    const { color, alpha } = theme.color(arc.color);
    const finalAlpha = alpha * (arc.dimmed ? dimmedAlpha : 1);
    if (arc.kind === "read") {
      graphics
        .circle(end.x, end.y, readMarkerRadius)
        .fill({ color, alpha: finalAlpha });
      continue;
    }
    // Inhibitor: hollow disc at the end, crossed by ticks along the path.
    const center = {
      x: end.x - polyline.endTangent.x * inhibitorMarkerRadius,
      y: end.y - polyline.endTangent.y * inhibitorMarkerRadius,
    };
    graphics
      .circle(center.x, center.y, inhibitorMarkerRadius)
      .fill(theme["neutral.s00"])
      .stroke({ color, alpha: finalAlpha, width: baseStrokeWidth });
    const total = polylineLength(polyline.points);
    const lastTick = total - (inhibitorMarkerRadius * 2 + inhibitorTickSpacing);
    for (
      let distance = inhibitorTickSpacing;
      distance <= lastTick;
      distance += inhibitorTickSpacing
    ) {
      const { point, tangent } = pointAlong(polyline.points, distance);
      const normal = { x: -tangent.y, y: tangent.x };
      graphics
        .moveTo(
          point.x - normal.x * inhibitorTickHalfLength,
          point.y - normal.y * inhibitorTickHalfLength,
        )
        .lineTo(
          point.x + normal.x * inhibitorTickHalfLength,
          point.y + normal.y * inhibitorTickHalfLength,
        )
        .stroke({
          color,
          alpha: finalAlpha,
          width: baseStrokeWidth,
          cap: "round",
        });
    }
  }
};

const weightLabelWidth = 32;
const weightLabelHeight = 20;

/** Weight labels for arcs with a weight above one: a white tag with "× n". */
const WeightLabel: FC<{
  arc: CanvasArc;
  at: CanvasPoint;
  theme: PixiTheme;
}> = ({ arc, at, theme }) => (
  <pixiContainer x={at.x} y={at.y} alpha={arc.dimmed ? dimmedAlpha : 1}>
    <pixiGraphics
      draw={(graphics) =>
        graphics
          .clear()
          .roundRect(
            -weightLabelWidth / 2,
            -weightLabelHeight / 2,
            weightLabelWidth,
            weightLabelHeight,
            3,
          )
          .fill(theme["neutral.s00"])
          .stroke({ color: weightLabelBorder, width: 1 })
      }
    />
    <pixiBitmapText
      text="×"
      x={-6}
      anchor={0.5}
      style={{
        fontFamily: pixiLabelFont,
        fontSize: 13,
        fill: weightSymbolColor,
      }}
    />
    <pixiBitmapText
      text={String(arc.weight)}
      x={6}
      anchor={0.5}
      style={{
        fontFamily: pixiLabelBoldFont,
        fontSize: 13,
        fill: weightTextColor,
      }}
    />
  </pixiContainer>
);

/** Everything about arcs that is not the ribbon: halos below, markers and labels above. */
export const PixiArcDecorations: FC<{
  scene: CanvasScene;
  polylines: ArcPolylines;
  theme: PixiTheme;
  layer: "below" | "above";
}> = ({ scene, polylines, theme, layer }) => {
  if (layer === "below") {
    return (
      <pixiGraphics
        draw={(graphics) => drawSelectionHalos(graphics, scene, polylines)}
        eventMode="none"
      />
    );
  }
  return (
    <>
      <pixiGraphics
        draw={(graphics) => drawMarkers(graphics, scene, polylines, theme)}
        eventMode="none"
      />
      {scene.arcs
        .filter((arc) => arc.weight > 1)
        .map((arc) => {
          const label = polylines.get(arc.id)?.label;
          return label ? (
            <WeightLabel key={arc.id} arc={arc} at={label} theme={theme} />
          ) : null;
        })}
    </>
  );
};

/** Live connection being dragged from a handle. */
export const PixiConnectionLine: FC<{
  from: CanvasPoint;
  to: CanvasPoint;
  valid: boolean;
  theme: PixiTheme;
}> = ({ from, to, valid, theme }) => (
  <pixiGraphics
    draw={(graphics) =>
      graphics
        .clear()
        .moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({
          color: valid ? theme["blue.s110"] : theme["neutral.s90"],
          width: baseStrokeWidth,
        })
    }
    eventMode="none"
  />
);
