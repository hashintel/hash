import { Box } from "@mui/material";
import { useMemo } from "react";

import type { SDCPN } from "@hashintel/petrinaut";

const PADDING = 8;
const VIEW_BOX_WIDTH = 240;
const VIEW_BOX_HEIGHT = 140;

const BASE_PLACE_RADIUS = 6;
const BASE_TRANSITION_WIDTH = 14;
const BASE_TRANSITION_HEIGHT = 9;
const STROKE_WIDTH = 1;

/**
 * Largest multiplier we'll apply to the base glyph sizes when the net is
 * very sparse. Caps how big the glyphs can grow so they still feel like a
 * preview, not a single oversized symbol.
 */
const MAX_SIZE_MULTIPLIER = 2.2;

/**
 * Lower bound on the fraction of viewbox area that the projected bounding
 * box has to occupy before we stop growing the glyphs.
 *
 * Without this, a net with effectively no spread (a single node or all
 * nodes collinear at the same point) would push the multiplier to
 * infinity. 0.15 means "if the bbox occupies less than 15% of the viewbox,
 * treat the empty space as 'wasted' and grow the glyphs at the cap".
 */
const MIN_FILL_RATIO = 0.15;

/**
 * Fraction of the nearest-neighbour distance we let any single glyph's
 * full extent occupy. Lower values guarantee a visible gap; 1 would let
 * adjacent glyphs touch.
 */
const NEIGHBOR_OCCUPANCY_FRACTION = 0.85;

/**
 * The half-dimension of the base transition rectangle used as the
 * worst-case glyph extent when capping growth against nearest-neighbour
 * distance — transitions are the widest base glyph so anything else fits.
 */
const BASE_MAX_HALF_EXTENT = BASE_TRANSITION_WIDTH / 2;

type Node =
  | {
      kind: "place";
      x: number;
      y: number;
      colorId: string | null;
    }
  | {
      kind: "transition";
      x: number;
      y: number;
    };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Lightweight non-interactive preview of a Petri net used in tile cards on
 * the `/processes` list. Renders places as circles and transitions as
 * rectangles, scaled and centred into a fixed viewbox. Arcs and labels are
 * intentionally omitted — at tile size they would just be noise.
 *
 * Glyph sizes grow when the projected bounding box doesn't fill the
 * viewbox, so a small/sparse net doesn't end up as a handful of dots in a
 * sea of whitespace.
 */
export const PetriNetPreview = ({ sdcpn }: { sdcpn: SDCPN }) => {
  const nodes: Node[] = useMemo(
    () => [
      ...sdcpn.places.map(
        (place): Node => ({
          kind: "place",
          x: place.x,
          y: place.y,
          colorId: place.colorId,
        }),
      ),
      ...sdcpn.transitions.map(
        (transition): Node => ({
          kind: "transition",
          x: transition.x,
          y: transition.y,
        }),
      ),
    ],
    [sdcpn.places, sdcpn.transitions],
  );

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of sdcpn.types) {
      map.set(type.id, type.displayColor);
    }
    return map;
  }, [sdcpn.types]);

  if (nodes.length === 0) {
    return (
      <Box
        sx={({ palette }) => ({
          alignItems: "center",
          color: palette.gray[40],
          display: "flex",
          flex: 1,
          fontSize: 12,
          justifyContent: "center",
          minHeight: 0,
        })}
      >
        Empty
      </Box>
    );
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y));

  const sourceWidth = Math.max(maxX - minX, 1);
  const sourceHeight = Math.max(maxY - minY, 1);

  /**
   * Reserve enough padding for the largest glyph we might end up drawing
   * (base size × max multiplier), so growing glyphs never clip at the
   * viewbox edges.
   */
  const maxGlyphHalfWidth = (BASE_TRANSITION_WIDTH * MAX_SIZE_MULTIPLIER) / 2;
  const maxGlyphHalfHeight = (BASE_TRANSITION_HEIGHT * MAX_SIZE_MULTIPLIER) / 2;

  const innerWidth = VIEW_BOX_WIDTH - PADDING * 2 - maxGlyphHalfWidth * 2;
  const innerHeight = VIEW_BOX_HEIGHT - PADDING * 2 - maxGlyphHalfHeight * 2;

  const scale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);

  /**
   * How much of the inner viewbox the projected bbox occupies. Used to
   * decide how much to grow the glyphs — sparse layouts (low fill ratio)
   * get bigger glyphs to compensate.
   */
  const projectedArea = sourceWidth * scale * (sourceHeight * scale);
  const fillRatio = clamp(
    projectedArea / (innerWidth * innerHeight),
    MIN_FILL_RATIO,
    1,
  );

  const fillRatioMultiplier = 1 / Math.sqrt(fillRatio);

  /**
   * The "fill ratio" heuristic alone doesn't know whether nodes are
   * clustered or evenly spread — a tightly-packed group of 12 nodes in a
   * sparse net would still get blown up. To prevent that, find the
   * smallest projected distance between any two nodes and use it as an
   * upper bound on glyph growth: a single glyph's full footprint must
   * remain a fraction of the nearest-neighbour gap.
   */
  let minNeighborDistance = Infinity;
  for (let outer = 0; outer < nodes.length; outer++) {
    for (let inner = outer + 1; inner < nodes.length; inner++) {
      const dx = (nodes[outer]!.x - nodes[inner]!.x) * scale;
      const dy = (nodes[outer]!.y - nodes[inner]!.y) * scale;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < minNeighborDistance) {
        minNeighborDistance = distance;
      }
    }
  }

  const neighborMultiplier = Number.isFinite(minNeighborDistance)
    ? (minNeighborDistance * NEIGHBOR_OCCUPANCY_FRACTION) /
      (BASE_MAX_HALF_EXTENT * 2)
    : MAX_SIZE_MULTIPLIER;

  const sizeMultiplier = clamp(
    Math.min(fillRatioMultiplier, neighborMultiplier),
    1,
    MAX_SIZE_MULTIPLIER,
  );

  const placeRadius = BASE_PLACE_RADIUS * sizeMultiplier;
  const transitionWidth = BASE_TRANSITION_WIDTH * sizeMultiplier;
  const transitionHeight = BASE_TRANSITION_HEIGHT * sizeMultiplier;

  /** Centre the bounding box within the viewbox. */
  const offsetX =
    PADDING + (innerWidth - sourceWidth * scale) / 2 + maxGlyphHalfWidth;
  const offsetY =
    PADDING + (innerHeight - sourceHeight * scale) / 2 + maxGlyphHalfHeight;

  const project = (node: Node): { x: number; y: number } => ({
    x: offsetX + (node.x - minX) * scale,
    y: offsetY + (node.y - minY) * scale,
  });

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      role="img"
      aria-label="Petri net preview"
      sx={{
        flex: 1,
        height: "100%",
        width: "100%",
      }}
    >
      {nodes.map((node, index) => {
        const { x, y } = project(node);
        const key = `${node.kind}-${index}`;

        if (node.kind === "place") {
          const customColor = node.colorId
            ? colorById.get(node.colorId)
            : undefined;
          return (
            <Box
              key={key}
              component="circle"
              cx={x}
              cy={y}
              r={placeRadius}
              sx={({ palette }) => ({
                fill: customColor ?? palette.common.white,
                stroke: palette.gray[40],
                strokeWidth: STROKE_WIDTH,
              })}
            />
          );
        }

        return (
          <Box
            key={key}
            component="rect"
            x={x - transitionWidth / 2}
            y={y - transitionHeight / 2}
            width={transitionWidth}
            height={transitionHeight}
            rx={1}
            sx={({ palette }) => ({
              fill: palette.gray[30],
              stroke: palette.gray[50],
              strokeWidth: STROKE_WIDTH,
            })}
          />
        );
      })}
    </Box>
  );
};
