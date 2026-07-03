/* eslint-disable no-console, no-bitwise -- committed diagnostic harness: renders the
   settled 20k layout to a PNG (bit ops are the PNG CRC/adler kernels) and PRINTS
   community-cohesion metrics for visual regression hunts. */
/**
 * Visual + cohesion snapshot of the majorization engine on a captured
 * fixture: settles a cold replay, writes a community-coloured PNG to /tmp,
 * and prints per-community spatial cohesion metrics (RMS spread over packing
 * radius, and how foreign each member's spatial neighbourhood is).
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer/worker/layout/majorization-visual.bench.ts \
 *     --disable-console-intercept
 *
 * Env knobs:
 *   MAJORIZATION_VISUAL_BUDGET   wall budget in seconds (default 300)
 *   MAJORIZATION_VISUAL_EDGES    1 to draw edges (default on)
 *   MAJORIZATION_VISUAL_OUT      output path (default /tmp/majorization-visual.png)
 *   MAJORIZATION_VISUAL_FIXTURE  captured-fixture JSON path (default the
 *                                committed 20k capture)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { mulberry32 } from "../../math/random";
import { FlatGraphBuffer } from "../buffers/position-buffer";
import { createMajorizationLayout } from "./majorization-layout";

import type { ForceEdge, ForceNode } from "./force-simulation";

const WALL_BUDGET_MS =
  Number(process.env.MAJORIZATION_VISUAL_BUDGET ?? 300) * 1000;
const DRAW_EDGES = process.env.MAJORIZATION_VISUAL_EDGES !== "0";
const OUT_PATH =
  process.env.MAJORIZATION_VISUAL_OUT ?? "/tmp/majorization-visual.png";
const SIZE = 2048;

interface CapturedFixtureJson {
  readonly nodes: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  }[];
  readonly edges: readonly {
    readonly source: string;
    readonly target: string;
    readonly weight: number;
  }[];
}

/** Same cold replay as the scale bench: keep topology/radii, scramble seeds. */
function loadFixture(): { nodes: ForceNode[]; edges: ForceEdge[] } {
  const fixturePath = process.env.MAJORIZATION_VISUAL_FIXTURE;
  const raw = readFileSync(
    fixturePath ??
      new URL("./fixtures/graph-fixture-20000n-22379e.json", import.meta.url),
    "utf8",
  );
  const fixture = JSON.parse(raw) as CapturedFixtureJson;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const random = mulberry32(20_000);
  const nodes: ForceNode[] = fixture.nodes.map((node, index) => {
    const distance = 20 * Math.sqrt(index + 1);
    const angle = index * goldenAngle + random() * Math.PI * 2;
    return {
      id: node.id,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radius: node.radius,
    };
  });
  return { nodes, edges: fixture.edges.map((edge) => ({ ...edge })) };
}

// ---------------------------------------------------------------- PNG output

const CRC_TABLE = new Uint32Array(256);
for (let byte = 0; byte < 256; byte++) {
  let crc = byte;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC_TABLE[byte] = crc >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode an RGB image (row-major, 3 bytes/px) as a PNG buffer. */
function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let row = 0; row < height; row++) {
    // filter byte 0 per scanline
    raw.set(
      rgb.subarray(row * width * 3, (row + 1) * width * 3),
      row * (1 + width * 3) + 1,
    );
  }
  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(idat)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

// ------------------------------------------------------------- rasterisation

/** Golden-ratio hue walk: distinct saturated colours per big community. */
function communityColor(rank: number): [number, number, number] {
  const hue = (rank * 0.618_033_988_749_895) % 1;
  const saturation = 0.75;
  const value = 0.95;
  const sector = Math.floor(hue * 6);
  const fraction = hue * 6 - sector;
  const low = value * (1 - saturation);
  const falling = value * (1 - fraction * saturation);
  const rising = value * (1 - (1 - fraction) * saturation);
  const [red, green, blue] = [
    [value, rising, low],
    [falling, value, low],
    [low, value, rising],
    [low, falling, value],
    [rising, low, value],
    [value, low, falling],
  ][sector % 6]!;
  return [
    Math.round(red! * 255),
    Math.round(green! * 255),
    Math.round(blue! * 255),
  ];
}

interface RenderInput {
  readonly nodes: readonly ForceNode[];
  readonly edges: readonly ForceEdge[];
  readonly communities: readonly number[];
  /** Community → palette rank for the big communities; others render gray. */
  readonly paletteRank: ReadonlyMap<number, number>;
  /** Fit the viewport to these node indices (all drawn regardless). */
  readonly focus: readonly number[];
}

function render(input: RenderInput): Buffer {
  const { nodes } = input;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const index of input.focus) {
    const node = nodes[index]!;
    minX = Math.min(minX, node.x ?? 0);
    minY = Math.min(minY, node.y ?? 0);
    maxX = Math.max(maxX, node.x ?? 0);
    maxY = Math.max(maxY, node.y ?? 0);
  }
  const scale = (SIZE - 40) / Math.max(maxX - minX, maxY - minY, 1);
  const offsetX = 20 - minX * scale + (SIZE - 40 - (maxX - minX) * scale) / 2;
  const offsetY = 20 - minY * scale + (SIZE - 40 - (maxY - minY) * scale) / 2;

  const rgb = new Uint8Array(SIZE * SIZE * 3).fill(16);

  const blend = (
    px: number,
    py: number,
    red: number,
    green: number,
    blue: number,
    alpha: number,
  ): void => {
    if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) {
      return;
    }
    const at = (py * SIZE + px) * 3;
    rgb[at] = rgb[at]! + (red - rgb[at]!) * alpha;
    rgb[at + 1] = rgb[at + 1]! + (green - rgb[at + 1]!) * alpha;
    rgb[at + 2] = rgb[at + 2]! + (blue - rgb[at + 2]!) * alpha;
  };

  if (DRAW_EDGES) {
    const indexOfId = new Map(nodes.map((node, index) => [node.id, index]));
    for (const edge of input.edges) {
      const source = nodes[indexOfId.get(edge.source as string)!];
      const target = nodes[indexOfId.get(edge.target as string)!];
      if (!source || !target) {
        continue;
      }
      const x0 = (source.x ?? 0) * scale + offsetX;
      const y0 = (source.y ?? 0) * scale + offsetY;
      const x1 = (target.x ?? 0) * scale + offsetX;
      const y1 = (target.y ?? 0) * scale + offsetY;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))),
      );
      for (let step = 0; step <= steps; step++) {
        const along = step / steps;
        blend(
          Math.round(x0 + (x1 - x0) * along),
          Math.round(y0 + (y1 - y0) * along),
          90,
          90,
          110,
          0.16,
        );
      }
    }
  }

  for (const [index, node] of nodes.entries()) {
    const community = input.communities[index] ?? -1;
    const rank = input.paletteRank.get(community);
    const [red, green, blue] =
      rank === undefined ? [140, 140, 140] : communityColor(rank);
    const cx = (node.x ?? 0) * scale + offsetX;
    const cy = (node.y ?? 0) * scale + offsetY;
    const radius = Math.max(0.8, node.radius * scale);
    const px0 = Math.floor(cx - radius);
    const px1 = Math.ceil(cx + radius);
    const py0 = Math.floor(cy - radius);
    const py1 = Math.ceil(cy + radius);
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius + 0.5) {
          const alpha = Math.min(1, radius + 0.5 - dist) * 0.95;
          blend(px, py, red, green, blue, alpha);
        }
      }
    }
  }

  return encodePng(rgb, SIZE, SIZE);
}

// ------------------------------------------------------------------ metrics

interface CommunityCohesion {
  readonly community: number;
  readonly members: number;
  /** RMS member distance to community centroid ÷ ideal packing radius: ~1 =
   * compact disk, ≫1 = scattered. */
  readonly spread: number;
  /** Fraction of members whose 8 nearest spatial neighbours are mostly
   * foreign (majority another community): ~0 = spatially coherent. */
  readonly foreign: number;
}

function cohesionMetrics(
  nodes: readonly ForceNode[],
  communities: readonly number[],
  minMembers: number,
): CommunityCohesion[] {
  const memberOf = new Map<number, number[]>();
  for (const [index, community] of communities.entries()) {
    const list = memberOf.get(community) ?? [];
    list.push(index);
    memberOf.set(community, list);
  }

  // Spatial grid for the neighbourhood-majority metric.
  const cell = 24;
  const bucketOf = new Map<string, number[]>();
  for (const [index, node] of nodes.entries()) {
    const key = `${Math.floor((node.x ?? 0) / cell)}:${Math.floor(
      (node.y ?? 0) / cell,
    )}`;
    const bucket = bucketOf.get(key) ?? [];
    bucket.push(index);
    bucketOf.set(key, bucket);
  }
  const neighboursOf = (index: number): number[] => {
    const node = nodes[index]!;
    const baseX = Math.floor((node.x ?? 0) / cell);
    const baseY = Math.floor((node.y ?? 0) / cell);
    const found: { index: number; distSq: number }[] = [];
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (const other of bucketOf.get(`${baseX + ox}:${baseY + oy}`) ?? []) {
          if (other === index) {
            continue;
          }
          const dx = (nodes[other]!.x ?? 0) - (node.x ?? 0);
          const dy = (nodes[other]!.y ?? 0) - (node.y ?? 0);
          found.push({ index: other, distSq: dx * dx + dy * dy });
        }
      }
    }
    found.sort((first, second) => first.distSq - second.distSq);
    return found.slice(0, 8).map((entry) => entry.index);
  };

  const result: CommunityCohesion[] = [];
  for (const [community, members] of memberOf) {
    if (members.length < minMembers) {
      continue;
    }
    let centroidX = 0;
    let centroidY = 0;
    let areaSq = 0;
    for (const member of members) {
      centroidX += nodes[member]!.x ?? 0;
      centroidY += nodes[member]!.y ?? 0;
      const half = nodes[member]!.radius + 4;
      areaSq += half * half;
    }
    centroidX /= members.length;
    centroidY /= members.length;
    let rmsSq = 0;
    let foreignMajority = 0;
    for (const member of members) {
      const dx = (nodes[member]!.x ?? 0) - centroidX;
      const dy = (nodes[member]!.y ?? 0) - centroidY;
      rmsSq += dx * dx + dy * dy;
      const neighbours = neighboursOf(member);
      if (neighbours.length >= 4) {
        const foreign = neighbours.filter(
          (other) => communities[other] !== community,
        ).length;
        if (foreign * 2 > neighbours.length) {
          foreignMajority += 1;
        }
      }
    }
    const packingRadius = Math.sqrt(areaSq / 0.55);
    result.push({
      community,
      members: members.length,
      spread: Math.sqrt(rmsSq / members.length) / packingRadius,
      foreign: foreignMajority / members.length,
    });
  }
  result.sort((first, second) => second.members - first.members);
  return result;
}

// --------------------------------------------------------------------- main

function run(): void {
  const { nodes, edges } = loadFixture();

  const constructStart = performance.now();
  const layout = createMajorizationLayout(
    nodes,
    edges,
    new FlatGraphBuffer(nodes.length),
  );
  const wallStart = performance.now();
  let ticks = 0;
  while (!layout.isSettled && performance.now() - wallStart < WALL_BUDGET_MS) {
    layout.tick(1);
    ticks += 1;
  }
  const wallMs = performance.now() - wallStart;
  console.log(
    "\n=== majorization-visual ===\n" +
      `constructMs=${(wallStart - constructStart).toFixed(0)} ` +
      `wallMs=${wallMs.toFixed(0)} ticks=${ticks} settled=${layout.isSettled}`,
  );

  const communities: readonly number[] =
    layout.communities ?? nodes.map((_, index) => index);
  const cohesion = cohesionMetrics(layout.nodes, communities, 200);
  const paletteRank = new Map<number, number>(
    cohesion.map((entry, rank) => [entry.community, rank]),
  );
  console.log("community cohesion (members / spread / foreign-majority):");
  for (const entry of cohesion.slice(0, 12)) {
    console.log(
      `  c${entry.community}: ${entry.members} / ${entry.spread.toFixed(2)} / ${(entry.foreign * 100).toFixed(1)}%`,
    );
  }

  // Fit the viewport to the giant component: dust and fragments are packed
  // onto a far larger component grid and would shrink the giant component
  // (where every regression lives) to a corner blob.
  const indexOfId = new Map(nodes.map((node, index) => [node.id, index]));
  const parent = Array.from({ length: nodes.length }, (_, index) => index);
  const rootOf = (start: number): number => {
    let root = start;
    while (parent[root]! !== root) {
      parent[root] = parent[parent[root]!]!;
      root = parent[root]!;
    }
    return root;
  };
  for (const edge of edges) {
    const source = rootOf(indexOfId.get(edge.source as string)!);
    const target = rootOf(indexOfId.get(edge.target as string)!);
    if (source !== target) {
      parent[source] = target;
    }
  }
  const componentSize = new Map<number, number>();
  for (let index = 0; index < nodes.length; index++) {
    const root = rootOf(index);
    componentSize.set(root, (componentSize.get(root) ?? 0) + 1);
  }
  let giantRoot = 0;
  let giantSize = 0;
  for (const [root, size] of componentSize) {
    if (size > giantSize) {
      giantRoot = root;
      giantSize = size;
    }
  }
  const focus: number[] = [];
  for (let index = 0; index < nodes.length; index++) {
    if (rootOf(index) === giantRoot) {
      focus.push(index);
    }
  }
  console.log(`focus: giant component ${giantSize} nodes`);

  writeFileSync(
    OUT_PATH,
    render({ nodes: layout.nodes, edges, communities, paletteRank, focus }),
  );
  console.log(`wrote ${OUT_PATH}`);
}

run();

describe("majorization visual (smoke)", () => {
  bench(
    "noop (renders at module scope)",
    () => {
      /* The PNG + metrics above are the deliverable. */
    },
    { time: 0, iterations: 1, warmupTime: 0, warmupIterations: 0 },
  );
});
