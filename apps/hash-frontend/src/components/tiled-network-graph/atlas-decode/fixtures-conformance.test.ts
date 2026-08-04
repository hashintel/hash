/**
 * Conformance against the checked-in wire fixtures: the Rust encoder
 * writes `libs/@local/graph/atlas/fixtures/wire/*.saltile` with JSON
 * sidecars, and every decoder implementation asserts field-for-field
 * equality against them (wire.md section 10). "Matches the server" is
 * proven by shared bytes, never by eye.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeSaltileEdges } from "./edges";
import { decodeSaltileLocate } from "./locate";
import { decodeSaltileTile } from "./tile";

import type { SaltileMode } from "./wire";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../libs/@local/graph/atlas/fixtures/wire",
);

const readFixture = (name: string): { buffer: ArrayBuffer; sidecar: never } => {
  const bytes = readFileSync(path.join(fixturesDir, `${name}.saltile`));
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const sidecar = JSON.parse(
    readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"),
  ) as never;
  return { buffer, sidecar };
};

/**
 * The delivery cut every checked-in tile golden was encoded at, as a
 * literal rather than as a function of the head it is compared against:
 * the generator cuts each tile at `m + k = 2`, which is what makes `g1`'s
 * `firstBucket` its `z + 2 = 4` and the root goldens' `runs` length
 * `2 + 1 = 3`. Deriving it from `firstBucket` instead would make the
 * decoder's echo check agree with itself by construction; written this
 * way, a regenerated fixture that moves its cut fails here loudly.
 */
const TILE_CUT_ADDEND = 2;

/** f32 bit patterns -> the numbers a decoded column holds. */
const f32FromBits = (bits: readonly number[]): number[] => [
  ...new Float32Array(new Uint32Array(bits).buffer),
];

/** A decoded f32 column -> the bit patterns a sidecar prints. */
const bitsOfF32 = (values: Float32Array): number[] => [
  ...new Uint32Array(values.buffer, values.byteOffset, values.length),
];

const bytesFromHex = (hex: string): Uint8Array =>
  new Uint8Array(
    Array.from({ length: hex.length / 2 }, (_, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  );

/** Sidecar 32-byte identity hex -> the decoder's `webUuid~entityUuid` form. */
const entityIdOfHex = (hex: string): string => {
  const uuid = (part: string): string =>
    `${part.slice(0, 8)}-${part.slice(8, 12)}-${part.slice(12, 16)}-${part.slice(16, 20)}-${part.slice(20)}`;
  return `${uuid(hex.slice(0, 32))}~${uuid(hex.slice(32))}`;
};

/** The tile sidecar shape, shared by all eight tile goldens. */
interface TileSidecar {
  readonly head: {
    readonly generation: string;
    readonly variant: number;
    readonly coordinate: [number, number, number];
    readonly mode: number;
    readonly delivered: number;
    readonly visible: number;
    readonly firstBucket: number;
    readonly runs: number[];
    readonly children: number;
    readonly trailer: boolean;
    readonly global: {
      readonly boundsBits: number[] | null;
      readonly minResolution: number;
      readonly visibleAtZoom: number;
    } | null;
  };
  readonly positions: number[];
  readonly rowIds: number[];
  readonly typeMask: number[] | null;
  readonly trailer: {
    readonly labels: (string | null)[];
    readonly icons: (string | null)[];
  } | null;
  readonly mass: number[] | null;
  readonly appended: Record<string, number[]> | null;
}

/**
 * Decodes one tile golden with the request its sidecar describes and
 * asserts every field the tile decoder exposes for every golden: the head
 * echoes, the run schedule, and the three columns. Per-fixture specifics
 * (global metadata, the trailer tail, slot tolerance) are asserted by the
 * caller against the same sidecar.
 *
 * `coloredTypeIdCount` is reconstructed from the mask's bytes per point,
 * which pins it to a band rather than a value - the wire carries
 * `ceil(count / 8)` bytes per row, so the top of the band decodes every
 * mask the fixtures hold. Same reasoning as the locate golden above.
 */
const decodeTileFixture = (
  name: string,
): { decoded: ReturnType<typeof decodeSaltileTile>; sidecar: TileSidecar } => {
  const { buffer, sidecar } = readFixture(name) as unknown as {
    buffer: ArrayBuffer;
    sidecar: TileSidecar;
  };
  const { head } = sidecar;
  const maskBytesPerPoint =
    sidecar.typeMask && head.delivered > 0
      ? sidecar.typeMask.length / head.delivered
      : 0;

  const decoded = decodeSaltileTile(buffer, {
    generation: bytesFromHex(head.generation),
    variant: head.variant,
    coordinate: {
      z: head.coordinate[0],
      x: head.coordinate[1],
      y: head.coordinate[2],
    },
    mode: head.mode as SaltileMode,
    deliverySpanLog2: TILE_CUT_ADDEND,
    coloredTypeIdCount: maskBytesPerPoint * 8,
    includeDetailedData: head.trailer,
  });

  expect(decoded.delivered).toBe(head.delivered);
  expect(decoded.visible).toBe(head.visible);
  expect(decoded.firstBucket).toBe(head.firstBucket);
  expect(decoded.runs).toEqual(head.runs);
  expect(decoded.children).toBe(head.children);

  // sum(runs) = delivered is law in every response (wire.md, the runs
  // contract), so the goldens are the cross-implementation witness for it.
  expect(decoded.runs.reduce((sum, run) => sum + run, 0)).toBe(head.delivered);

  // Sidecar positions are f32 bit patterns (never printed decimals).
  expect(bitsOfF32(decoded.positions)).toEqual(sidecar.positions);
  expect(decoded.positions.length).toBe(head.delivered * 2);
  expect([...decoded.rowIds]).toEqual(sidecar.rowIds);
  expect(decoded.typeMask === null ? null : [...decoded.typeMask]).toEqual(
    sidecar.typeMask,
  );

  return { decoded, sidecar };
};

describe("wire fixtures", () => {
  it("names every golden on disk, so a new fixture cannot land undecoded", () => {
    // The gap this closes is the one that left the eight tile goldens unread for as long as they
    // existed: the suite was normative and nothing said which fixtures it covered. Checked against
    // this file's own source, so adding a golden fails here until someone writes its case.
    //
    // Its limit, stated rather than papered over: a name mentioned in a comment satisfies this, so it
    // catches an unnoticed fixture and never proves how deeply one is read.
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const goldens = readdirSync(fixturesDir)
      .filter((entry) => entry.endsWith(".saltile"))
      .map((entry) => entry.replace(/\.saltile$/, ""));

    expect(goldens.length).toBeGreaterThan(0);
    expect(goldens.filter((golden) => !source.includes(golden))).toEqual([]);
  });

  it("decodes g1-minimal-tile field-for-field against its sidecar", () => {
    const { decoded } = decodeTileFixture("g1-minimal-tile");

    // A delta tile below the root: one run, starting at the cut.
    expect(decoded.firstBucket).toBe(2 /* z */ + TILE_CUT_ADDEND);
    expect(decoded.runs).toHaveLength(1);
    expect(decoded.global).toBeNull();
    expect(decoded.detail).toBeNull();
  });

  it("decodes g2-root-tile, whose global metadata frames the camera", () => {
    const { decoded, sidecar } = decodeTileFixture("g2-root-tile");
    const global = sidecar.head.global!;

    expect(decoded.global).toEqual({
      visibleAtZoom: global.visibleAtZoom,
      bounds: f32FromBits(global.boundsBits!),
      minResolution: global.minResolution,
    });
    // The root of a delta cascade starts at bucket 0 and carries the whole
    // schedule, gaps included.
    expect(decoded.firstBucket).toBe(0);
    expect(decoded.runs).toHaveLength(TILE_CUT_ADDEND + 1);
    expect(decoded.detail).toBeNull();
  });

  it("decodes g3-total-tile, a total-mode cascade with a two-byte type mask", () => {
    const { decoded, sidecar } = decodeTileFixture("g3-total-tile");

    expect(sidecar.head.mode).toBe(1 satisfies SaltileMode);
    // Total mode delivers every bucket up to the cut, from zero.
    expect(decoded.firstBucket).toBe(0);
    expect(decoded.runs).toHaveLength(1 /* z */ + TILE_CUT_ADDEND + 1);
    expect(decoded.typeMask).not.toBeNull();
    expect(decoded.typeMask!.length).toBe(sidecar.head.delivered * 2);
  });

  it("decodes g4-empty-root, where the visible set is empty and bounds are absent", () => {
    const { decoded } = decodeTileFixture("g4-empty-root");

    expect(decoded.delivered).toBe(0);
    expect(decoded.visible).toBe(0);
    expect(decoded.positions).toHaveLength(0);
    expect(decoded.rowIds).toHaveLength(0);
    expect(decoded.typeMask).toBeNull();
    expect(decoded.global).toEqual({
      visibleAtZoom: 0,
      bounds: null,
      minResolution: 0,
    });
  });

  it("decodes g5-trailer-tile's per-point labels and icons, multibyte included", () => {
    const { decoded, sidecar } = decodeTileFixture("g5-trailer-tile");
    const trailer = sidecar.trailer!;

    expect(decoded.detail).not.toBeNull();
    expect(decoded.detail!.labels).toEqual(trailer.labels);
    expect(decoded.detail!.icons).toEqual(trailer.icons);
    expect(decoded.detail!.labels).toHaveLength(sidecar.head.delivered);
  });

  it("decodes g8-appended-slot, tolerating a present mass slot and an appended one", () => {
    const { decoded, sidecar } = decodeTileFixture("g8-appended-slot");

    // The golden's own reason for existing: a directory longer than the
    // kind's v1 table, plus a payload in the reserved mass slot. Both are
    // forward compatibility, so decoding must succeed and expose neither -
    // the mass column has no field on the decoded tile, and the sidecar
    // prints it for the implementations that do read it.
    expect(sidecar.mass).not.toBeNull();
    expect(sidecar.appended).not.toBeNull();
    expect(decoded.detail).toBeNull();
    expect(decoded.global).toBeNull();
  });

  it("decodes g9-padding-low and g10-padding-high across their alignment padding", () => {
    const low = decodeTileFixture("g9-padding-low");
    const high = decodeTileFixture("g10-padding-high");

    // Deep coordinates with wide visible counts: the columns land behind
    // different amounts of 8-alignment padding in the two goldens, and
    // g10 also appends two unknown slots.
    expect(low.decoded.rowIds).toHaveLength(low.sidecar.head.delivered);
    expect(high.decoded.rowIds).toHaveLength(high.sidecar.head.delivered);
    expect(high.sidecar.appended).not.toBeNull();
  });

  it("decodes g6-edges field-for-field against its sidecar", () => {
    const { buffer, sidecar } = readFixture("g6-edges") as {
      buffer: ArrayBuffer;
      sidecar: {
        head: {
          generation: string;
          variant: number;
          count: number;
          complete: boolean;
          trailer: boolean;
        };
        sources: number[];
        targets: number[];
        edgeIds: string[];
        trailer: {
          typeTable: string[];
          linkLabels: (string | null)[];
          linkTypeIds: (number | null)[];
        };
      };
    };

    const decoded = decodeSaltileEdges(buffer, {
      generation: bytesFromHex(sidecar.head.generation),
      variant: sidecar.head.variant,
      includeDetailedData: sidecar.head.trailer,
    });

    expect(decoded.count).toBe(sidecar.head.count);
    expect(decoded.complete).toBe(sidecar.head.complete);
    expect([...decoded.sources]).toEqual(sidecar.sources);
    expect([...decoded.targets]).toEqual(sidecar.targets);
    expect(decoded.edgeIds).toEqual(sidecar.edgeIds.map(entityIdOfHex));
    expect(decoded.detail?.typeTable).toEqual(sidecar.trailer.typeTable);
    expect(decoded.detail?.linkLabels).toEqual(sidecar.trailer.linkLabels);
    expect(decoded.detail?.linkTypeIds).toEqual(
      sidecar.trailer.linkTypeIds.map((index) =>
        index === null ? null : sidecar.trailer.typeTable[index]!,
      ),
    );
  });

  it("decodes g7-locate field-for-field against its sidecar", () => {
    const { buffer, sidecar } = readFixture("g7-locate") as {
      buffer: ArrayBuffer;
      sidecar: {
        head: {
          generation: string;
          variant: number;
          count: number;
          zoom: number;
          cell: [number, number, number];
          edges: number;
          complete: boolean;
          entityId: string;
          typeIdsComplete: boolean;
          propertiesComplete: boolean;
        };
        positions: number[];
        rowIds: number[];
        sources: number[];
        targets: number[];
        edgeIds: string[];
        typeMask: number[];
        trailer: {
          typeTable: string[];
          propertyTable: string[];
          labels: (string | null)[];
          typeIds: (number | null)[];
          properties: Record<string, unknown>;
          linkLabels: (string | null)[];
          linkTypeIds: number[][];
          linkTypeIdsComplete: boolean[];
          linkProperties: (Record<string, unknown> | null)[];
          linkPropertiesComplete: boolean[];
        };
      };
    };

    // The fixture's TYPE_MASK column is one byte per point: the fixture
    // request carried between one and eight colored type ids.
    const decoded = decodeSaltileLocate(buffer, {
      generation: bytesFromHex(sidecar.head.generation),
      variant: sidecar.head.variant,
      coloredTypeIdCount: 8,
    });

    expect(decoded.count).toBe(sidecar.head.count);
    expect(decoded.zoom).toBe(sidecar.head.zoom);
    expect(decoded.cell).toEqual({
      z: sidecar.head.cell[0],
      x: sidecar.head.cell[1],
      y: sidecar.head.cell[2],
    });
    expect(decoded.edgesCount).toBe(sidecar.head.edges);
    expect(decoded.complete).toBe(sidecar.head.complete);
    expect(decoded.entityId).toBe(entityIdOfHex(sidecar.head.entityId));
    expect(decoded.typeIdsComplete).toBe(sidecar.head.typeIdsComplete);
    expect(decoded.propertiesComplete).toBe(sidecar.head.propertiesComplete);

    // Sidecar positions are f32 bit patterns (never printed decimals).
    const positionBits = new Uint32Array(
      decoded.positions.buffer,
      decoded.positions.byteOffset,
      decoded.positions.length,
    );
    expect([...positionBits]).toEqual(sidecar.positions);

    expect([...decoded.rowIds]).toEqual(sidecar.rowIds);
    expect([...decoded.sources]).toEqual(sidecar.sources);
    expect([...decoded.targets]).toEqual(sidecar.targets);
    expect(decoded.edgeIds).toEqual(sidecar.edgeIds.map(entityIdOfHex));
    expect([...(decoded.typeMask ?? [])]).toEqual(sidecar.typeMask);

    const { detail } = decoded;
    expect(detail.typeTable).toEqual(sidecar.trailer.typeTable);
    expect(detail.propertyTable).toEqual(sidecar.trailer.propertyTable);
    expect(detail.labels).toEqual(sidecar.trailer.labels);
    expect(detail.typeIds).toEqual(
      sidecar.trailer.typeIds.map((index) =>
        index === null ? null : sidecar.trailer.typeTable[index]!,
      ),
    );
    expect(detail.properties).toEqual(sidecar.trailer.properties);
    expect(detail.linkLabels).toEqual(sidecar.trailer.linkLabels);
    expect(detail.linkTypeIds).toEqual(
      sidecar.trailer.linkTypeIds.map((indexes) =>
        indexes.map((index) => sidecar.trailer.typeTable[index]!),
      ),
    );
    expect(detail.linkTypeIdsComplete).toEqual(
      sidecar.trailer.linkTypeIdsComplete,
    );
    expect(detail.linkProperties).toEqual(sidecar.trailer.linkProperties);
    expect(detail.linkPropertiesComplete).toEqual(
      sidecar.trailer.linkPropertiesComplete,
    );
  });
});
