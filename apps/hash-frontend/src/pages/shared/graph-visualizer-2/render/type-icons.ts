/**
 * TYPE-ICON render: each entity's type icon drawn at its dot centre via a deck.gl `IconLayer`,
 * reading the SAME SAB the dots read (binary attributes, stride/offset onto the record fields) -- so
 * positions/sizes never drift from the dots and there is no gather. Icons come from {@link IconAtlas}
 * (a rasterised atlas of emoji + URL silhouettes); `names` maps a render index to its atlas key (or
 * null for none). {@link typeIconLayer} serves the flat tier (one whole-graph SAB, per-node radius);
 * {@link leafTypeIconLayers} serves the hierarchical tier (one layer per open leaf, uniform radius).
 *
 * SOFT LOD: the icon is sized as a fraction of the dot DIAMETER and fades in only once that dot has
 * enough screen presence. The only CPU zoom work is a coarse-bucket accessor refresh from Scene, not
 * per-pan churn.
 */
import { IconLayer } from "@deck.gl/layers";

import {
  FLAT_HEADER_BYTES,
  FLAT_RADIUS_BYTE_OFFSET,
  FLAT_RECORD_BYTES,
  leafPositionAttribute,
} from "../worker/buffers/position-buffer";

import type {
  PositionsFrame,
  RenderFlatGraph,
  StructureFrame,
} from "../frames";
import type { ClusterId } from "../ids";
import type { IconAtlas } from "./gpu/icon-atlas";
import type { ClusterReference } from "./worker-connection";
import type { Layer } from "@deck.gl/core";
import type { Device } from "@luma.gl/core";

/**
 * Icon diameter as a fraction of the dot DIAMETER, leaving a ring of the dot's type colour visible
 * around the icon as padding so the glyph reads as sitting INSIDE the dot, not covering it.
 */
const ICON_TO_DOT_DIAMETER = 0.55;
const ICON_MIN_SCREEN_DIAMETER = 18;
const ICON_FADE_PX = 10;

function iconAlpha(screenDiameter: number): number {
  const progress = Math.min(
    1,
    Math.max(
      0,
      (screenDiameter - ICON_MIN_SCREEN_DIAMETER + ICON_FADE_PX) / ICON_FADE_PX,
    ),
  );
  return Math.round(235 * progress);
}

interface TypeIconLayerParams {
  readonly graph: RenderFlatGraph;
  readonly clusters: Map<ClusterId, ClusterReference>;
  readonly atlas: IconAtlas;
  /** The GPU device the atlas texture must be built on (the Deck instance's device). */
  readonly device: Device;
  /** Per-render-index atlas key, or null for "no icon" (built by the Scene's icon-data scan). */
  readonly names: readonly (string | null)[];
  /** Version of {@link names}; combined with the atlas version drives the getIcon trigger. */
  readonly namesVersion: number;
  /** Bumped every position frame; drives the position/size triggers (same as the dots). */
  readonly positionTick: number;
  /** Current view zoom, quantized by Scene before this layer is rebuilt. */
  readonly zoom: number;
  /** Drives icon visibility/color accessors when the coarse zoom LOD bucket changes. */
  readonly zoomBucket: number;
}

export function typeIconLayer({
  graph,
  clusters,
  atlas,
  device,
  names,
  namesVersion,
  positionTick,
  zoom,
  zoomBucket,
}: TypeIconLayerParams): Layer[] {
  const cluster = clusters.get(graph.layoutId);
  if (!cluster) {
    return [];
  }
  const floats = new Float32Array(cluster.versionView.buffer);
  const scale = 2 ** zoom;
  const radiusAt = (index: number): number => {
    const recordBase =
      (FLAT_HEADER_BYTES + index * FLAT_RECORD_BYTES) /
      Float32Array.BYTES_PER_ELEMENT;
    return (
      floats[
        recordBase + FLAT_RADIUS_BYTE_OFFSET / Float32Array.BYTES_PER_ELEMENT
      ] ?? 0
    );
  };
  return [
    new IconLayer({
      id: "flat-type-icons",
      data: {
        length: graph.count,
        attributes: {
          getPosition: {
            value: floats,
            size: 2,
            stride: FLAT_RECORD_BYTES,
            offset: FLAT_HEADER_BYTES,
          },
          // The dot RADIUS feeds getSize; sizeScale below turns radius into the icon diameter.
          getSize: {
            value: floats,
            size: 1,
            stride: FLAT_RECORD_BYTES,
            offset: FLAT_HEADER_BYTES + FLAT_RADIUS_BYTE_OFFSET,
          },
        },
      },
      iconAtlas: atlas.getTexture(device),
      iconMapping: atlas.getMapping(),
      // size = radius * 2 * ICON_TO_DOT_DIAMETER = icon diameter; in `common` units it tracks the
      // node-contained dot mark rather than acting like a fixed UI glyph.
      sizeUnits: "common",
      sizeScale: 2 * ICON_TO_DOT_DIAMETER,
      getIcon: (_: unknown, info: { index: number }) => {
        const key = names[info.index];
        if (key === null || key === undefined || !atlas.has(key)) {
          return "";
        }
        return iconAlpha(radiusAt(info.index) * 2 * scale) > 0 ? key : "";
      },
      // Cells are pre-coloured (white silhouettes / full-colour emoji): draw them as-is.
      getColor: (_: unknown, info: { index: number }) => [
        255,
        255,
        255,
        iconAlpha(radiusAt(info.index) * 2 * scale),
      ],
      billboard: true,
      pickable: false,
      updateTriggers: {
        getPosition: positionTick,
        getSize: positionTick,
        // A names change OR a newly-ready async raster (atlas.version) must re-evaluate icons.
        getIcon: `${namesVersion}:${atlas.version}:${zoomBucket}`,
        getColor: zoomBucket,
      },
    }),
  ];
}

interface LeafTypeIconLayersParams {
  readonly structure: StructureFrame;
  readonly positions: PositionsFrame;
  readonly clusters: Map<ClusterId, ClusterReference>;
  readonly atlas: IconAtlas;
  /** The GPU device the atlas texture must be built on (the Deck instance's device). */
  readonly device: Device;
  /**
   * Per open leaf (keyed by `layoutId`), the per-local-index atlas key (or null for none), built by
   * the Scene's icon-data scan -- index-aligned with the leaf's SAB records / dots.
   */
  readonly namesByLeaf: ReadonlyMap<ClusterId, readonly (string | null)[]>;
  /** Version of {@link namesByLeaf}; with the atlas version drives the getIcon trigger. */
  readonly namesVersion: number;
  /** Bumped every position frame; drives the position trigger (same as the dots). */
  readonly positionTick: number;
  /** Current view zoom, quantized by Scene before this layer is rebuilt. */
  readonly zoom: number;
  /** Drives icon visibility/color accessors when the coarse zoom LOD bucket changes. */
  readonly zoomBucket: number;
}

/**
 * Hierarchical-tier type icons: one {@link IconLayer} per open leaf, drawn over the leaf's entity
 * dots. Each leaf reads its own position SAB (local coords) offset to the leaf centre by the SAME
 * modelMatrix the dots use, so the icons track the dots exactly. A leaf's dots share ONE radius, so
 * the soft-LOD is all-or-nothing per leaf: below the screen-size bar the leaf's layer is skipped
 * entirely (cheaper than a per-dot fade that would never differ within a leaf).
 */
export function leafTypeIconLayers({
  structure,
  positions,
  clusters,
  atlas,
  device,
  namesByLeaf,
  namesVersion,
  positionTick,
  zoom,
  zoomBucket,
}: LeafTypeIconLayersParams): Layer[] {
  const scale = 2 ** zoom;
  const clusterPositions = positions.clusterPositions;
  const layers: Layer[] = [];
  for (const layer of structure.entityLayers) {
    const cluster = clusters.get(layer.layoutId);
    const names = namesByLeaf.get(layer.layoutId);
    if (!cluster || !names) {
      continue;
    }
    // Uniform leaf-dot radius -> one screen diameter for the whole leaf, so the fade is all-or-none.
    const alpha = iconAlpha(layer.radius * 2 * scale);
    if (alpha <= 0) {
      continue;
    }
    const originX = clusterPositions[layer.leafClusterIndex * 2] ?? 0;
    const originY = clusterPositions[layer.leafClusterIndex * 2 + 1] ?? 0;
    layers.push(
      new IconLayer({
        id: `leaf-type-icons:${layer.layoutId}`,
        data: {
          length: layer.count,
          attributes: {
            getPosition: leafPositionAttribute(cluster.versionView.buffer),
          },
        },
        // oxfmt-ignore
        modelMatrix: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          originX, originY, 0, 1,
        ],
        iconAtlas: atlas.getTexture(device),
        iconMapping: atlas.getMapping(),
        sizeUnits: "common",
        getSize: layer.radius * 2 * ICON_TO_DOT_DIAMETER,
        getIcon: (_: unknown, info: { index: number }) => {
          const key = names[info.index];
          return key !== null && key !== undefined && atlas.has(key) ? key : "";
        },
        getColor: [255, 255, 255, alpha],
        billboard: true,
        pickable: false,
        updateTriggers: {
          getPosition: positionTick,
          getIcon: `${namesVersion}:${atlas.version}:${zoomBucket}`,
        },
      }),
    );
  }
  return layers;
}
